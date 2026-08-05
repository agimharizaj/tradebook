"use client";

// Settings: account-level configuration split into tabs. Trading profile
// fields keep writing auth user_metadata (the rest of the app reads them
// there); guardrails, routine and the tutorial flag live in user_settings
// (migration 0016). If that migration has not been applied yet, those
// sections show a notice and skip persistence instead of erroring.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withCommas } from "@/lib/format";
import {
  emptySettings,
  fetchSettings,
  saveSettings,
  type UserSettings,
} from "@/lib/settings";
import PairsManager from "@/components/PairsManager";
import ThemeToggle from "@/components/ThemeToggle";
import BackLink from "@/components/BackLink";
import { MoneyOrPct, WindowPicker } from "@/components/RiskFields";
import AccountsTab from "@/components/settings/AccountsTab";

type Meta = Record<string, unknown>;
const str = (m: Meta, k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "trading", label: "Trading" },
  { id: "routine", label: "Pre-market routine" },
  { id: "pairs", label: "Trading pairs" },
  { id: "appearance", label: "Appearance" },
  { id: "help", label: "Tutorial & help" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function SettingsWorkspace({ meta }: { meta: Meta }) {
  const supabase = createClient();
  const [tab, setTab] = useState<TabId>("trading");
  const [settings, setSettings] = useState<UserSettings>(emptySettings());
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);

  // Trading profile (auth metadata, moved here from Profile).
  const [profile, setProfile] = useState({
    broker: str(meta, "broker"),
    account_currency: str(meta, "account_currency") || "USD",
    account_size: withCommas(str(meta, "account_size")),
    default_risk_pct: str(meta, "default_risk_pct"),
    experience: str(meta, "experience"),
    trading_style: str(meta, "trading_style"),
    markets: str(meta, "markets"),
  });
  const setP = (k: keyof typeof profile, v: string) =>
    setProfile((f) => ({ ...f, [k]: v }));
  const [savingProfile, setSavingProfile] = useState(false);

  // Guardrails draft (user_settings).
  const [guard, setGuard] = useState({
    max_trades_per_day: "",
    max_daily_loss: "",
    max_daily_profit: "",
    trading_window: "",
    trading_window_2: "",
  });
  const setG = (k: keyof typeof guard, v: string) => setGuard((f) => ({ ...f, [k]: v }));
  const [savingGuard, setSavingGuard] = useState(false);
  // Live account size for the "= X of account now" hints, tracking the
  // trading-profile field as it's typed.
  const accountSizeNum = (() => {
    const n = parseFloat(profile.account_size.replace(/,/g, ""));
    return Number.isNaN(n) ? 0 : n;
  })();

  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    // ?tab=pairs deep links (old /profile/pairs redirects here).
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
    fetchSettings(supabase).then(({ settings: s, available: a }) => {
      setSettings(s);
      setAvailable(a);
      setGuard({
        max_trades_per_day: s.max_trades_per_day != null ? String(s.max_trades_per_day) : "",
        max_daily_loss: s.max_daily_loss ?? "",
        max_daily_profit: s.max_daily_profit ?? "",
        trading_window: s.trading_window ?? "",
        trading_window_2: s.trading_window_2 ?? "",
      });
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(patch: Partial<UserSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    if (!available) return;
    const err = await saveSettings(supabase, patch);
    if (err) setMsg({ t: "err", text: `Could not save: ${err}` });
  }

  async function saveProfile() {
    setSavingProfile(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const current = (u.user?.user_metadata ?? {}) as Meta;
    // Merge over fresh metadata so nothing edited elsewhere gets clobbered.
    const { pairs: _pairs, ...rest } = current;
    void _pairs;
    const { error } = await supabase.auth.updateUser({
      data: {
        ...rest,
        ...profile,
        account_size: profile.account_size.replace(/,/g, ""),
      },
    });
    setSavingProfile(false);
    setMsg(error ? { t: "err", text: error.message } : { t: "ok", text: "Trading profile saved." });
  }

  async function saveGuardrails() {
    setSavingGuard(true);
    setMsg(null);
    const n = parseInt(guard.max_trades_per_day, 10);
    const patch: Partial<UserSettings> = {
      max_trades_per_day: Number.isNaN(n) ? null : n,
      max_daily_loss: guard.max_daily_loss.trim() || null,
      max_daily_profit: guard.max_daily_profit.trim() || null,
      trading_window: guard.trading_window.trim() || null,
      trading_window_2: guard.trading_window_2.trim() || null,
    };
    setSettings((s) => ({ ...s, ...patch }));
    const err = available ? await saveSettings(supabase, patch) : null;
    setSavingGuard(false);
    setMsg(
      err
        ? { t: "err", text: `Could not save: ${err}` }
        : { t: "ok", text: available ? "Guardrails saved." : "Saved locally only - apply migration 0016 to persist." }
    );
  }

  function addRoutineItem() {
    const v = newItem.trim();
    if (!v || settings.routine_items.includes(v)) return;
    setNewItem("");
    persist({ routine_items: [...settings.routine_items, v] });
  }

  function removeRoutineItem(item: string) {
    persist({ routine_items: settings.routine_items.filter((x) => x !== item) });
  }

  function moveRoutineItem(i: number, delta: -1 | 1) {
    const next = [...settings.routine_items];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    persist({ routine_items: next });
  }

  async function toggleNotify() {
    const next = !settings.routine_notify;
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg({ t: "err", text: "Notifications are blocked in the browser, so reminders can't fire." });
      }
    }
    persist({ routine_notify: next });
  }

  const migrationNote = !available && loaded && (
    <p className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
      The <span className="font-mono">user_settings</span> table isn&apos;t available yet (migration
      0016). Everything here works for this session but won&apos;t persist until it&apos;s applied.
    </p>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-10">
      <BackLink fallback="/dashboard" />
      <h1 className="mt-2 text-2xl">Settings</h1>
      <p className="mt-1 text-muted">Account-level trading configuration.</p>

      {msg && (
        <p aria-live="polite" className={`mt-4 text-sm ${msg.t === "ok" ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="scrollbar-none mt-6 flex gap-1.5 overflow-x-auto border-b border-border pb-px" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-accent text-accent2"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {tab === "accounts" && (
          <Section
            title="Accounts"
            lead="One entry per prop-firm account instance (or your personal account). Trades attach to the account you have selected; guardrails are set per account; outcomes are recorded, never deleted."
          >
            <AccountsTab defaults={settings} cur={profile.account_currency || "USD"} />
          </Section>
        )}

        {tab === "trading" && (
          <>
            <Section
              title="Default guardrails"
              lead="These prefill every new account and act as the fallback for trades with no account. Per-account limits (Settings > Accounts) win when an account is selected. Money limits take a figure (200) or a percent of account (5%)."
            >
              {migrationNote}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Max trades / day">
                  <input inputMode="numeric" value={guard.max_trades_per_day} onChange={(e) => setG("max_trades_per_day", e.target.value)} placeholder="5" className="field" style={{ fontFamily: "var(--font-mono)" }} />
                </Field>
                <div className="hidden sm:block" />
                <MoneyOrPct
                  label="Max daily loss"
                  v={guard.max_daily_loss}
                  on={(v) => setG("max_daily_loss", v)}
                  accountSize={accountSizeNum}
                />
                <MoneyOrPct
                  label="Daily profit target"
                  v={guard.max_daily_profit}
                  on={(v) => setG("max_daily_profit", v)}
                  accountSize={accountSizeNum}
                />
                <WindowPicker
                  label="Trading window"
                  value={guard.trading_window}
                  on={(v) => setG("trading_window", v)}
                />
                <WindowPicker
                  label="Trading window 2 (optional)"
                  value={guard.trading_window_2}
                  on={(v) => setG("trading_window_2", v)}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <ToggleRow
                  label="Warn on Trading page"
                  desc="Show live guardrail warnings while charting"
                  on={settings.warn_on_charts}
                  onToggle={() => persist({ warn_on_charts: !settings.warn_on_charts })}
                />
              </div>
              <button
                onClick={saveGuardrails}
                disabled={savingGuard}
                className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {savingGuard ? "Saving..." : "Save guardrails"}
              </button>
            </Section>

            <Section
              title="Trading profile"
              lead="Moved here from Profile. Account size and currency feed the risk engine, journal percentages, and percent-based limits."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Broker / prop firm"><input value={profile.broker} onChange={(e) => setP("broker", e.target.value)} placeholder="FTMO" className="field" /></Field>
                <Field label="Account currency">
                  <input
                    list="ccy-list"
                    value={profile.account_currency}
                    onChange={(e) => setP("account_currency", e.target.value.toUpperCase())}
                    className="field"
                  />
                  <datalist id="ccy-list">
                    {["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","SGD","HKD","SEK","NOK","DKK","PLN","ZAR","AED"].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Account size"><input inputMode="decimal" value={profile.account_size} onChange={(e) => setP("account_size", withCommas(e.target.value))} placeholder="10,000" className="field" /></Field>
                <Field label="Default risk % / trade"><input inputMode="decimal" value={profile.default_risk_pct} onChange={(e) => setP("default_risk_pct", e.target.value)} placeholder="1" className="field" /></Field>
                <Field label="Experience">
                  <select value={profile.experience} onChange={(e) => setP("experience", e.target.value)} className="field">
                    <option value="">Select...</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                    <option>Professional</option>
                  </select>
                </Field>
                <Field label="Trading style">
                  <select value={profile.trading_style} onChange={(e) => setP("trading_style", e.target.value)} className="field">
                    <option value="">Select...</option>
                    <option>Scalper</option>
                    <option>Day trader</option>
                    <option>Swing trader</option>
                    <option>Position trader</option>
                  </select>
                </Field>
                <Field label="Markets traded"><input value={profile.markets} onChange={(e) => setP("markets", e.target.value)} placeholder="FX, indices, gold" className="field" /></Field>
              </div>
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save trading profile"}
              </button>
            </Section>
          </>
        )}

        {tab === "routine" && (
          <Section
            title="Pre-market routine"
            lead="Your daily checklist. It appears on the Trading page and in each day's journal. Ticks reset every trading day."
          >
            {migrationNote}
            <div className="space-y-2">
              {settings.routine_items.map((item, i) => (
                <div key={item} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2.5">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveRoutineItem(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move "${item}" up`}
                      className="rounded p-0.5 text-dim transition hover:text-foreground disabled:opacity-30"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button
                      onClick={() => moveRoutineItem(i, 1)}
                      disabled={i === settings.routine_items.length - 1}
                      aria-label={`Move "${item}" down`}
                      className="rounded p-0.5 text-dim transition hover:text-foreground disabled:opacity-30"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                  <span className="flex-1 text-sm">{item}</span>
                  <button
                    onClick={() => removeRoutineItem(item)}
                    aria-label={`Remove "${item}"`}
                    className="rounded-md p-1.5 text-muted transition hover:bg-danger/15 hover:text-danger"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {settings.routine_items.length === 0 && (
                <p className="text-sm text-dim">No routine items yet. Add your first below.</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRoutineItem(); }}
                placeholder="Add a routine item..."
                className="field flex-1"
              />
              <button
                onClick={addRoutineItem}
                className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Add
              </button>
            </div>

            <div className="mt-6 space-y-4 border-t border-border pt-5">
              <ToggleRow
                label="Browser notification"
                desc="Remind me while the app is open if the routine isn't done by the time below"
                on={settings.routine_notify}
                onToggle={toggleNotify}
              />
              <Field label="Remind at (local time)">
                <input
                  type="time"
                  value={settings.routine_remind_at ?? ""}
                  onChange={(e) => persist({ routine_remind_at: e.target.value || null })}
                  className="field w-40"
                />
              </Field>
            </div>
          </Section>
        )}

        {tab === "pairs" && <PairsManager initial={meta.pairs} />}

        {tab === "appearance" && (
          <Section title="Appearance" lead="Theme applies instantly and is remembered on this device.">
            <div className="w-fit rounded-lg border border-border2">
              <ThemeToggle />
            </div>
            <p className="mt-2 text-xs text-dim">Tap to cycle System, Light, and Dark.</p>
          </Section>
        )}

        {tab === "help" && (
          <Section title="Tutorial & help" lead="Replay the first-login tour any time.">
            <button
              onClick={() => window.dispatchEvent(new Event("tb:start-tour"))}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Replay the tour
            </button>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      {lead && <p className="mt-1.5 mb-4 text-sm text-muted">{lead}</p>}
      {!lead && <div className="mb-4" />}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onToggle,
}: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-dim">{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
          on ? "border-transparent bg-accent" : "border-border2 bg-surface2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            on ? "left-[18px] bg-white" : "left-0.5 bg-dim"
          }`}
        />
      </button>
    </div>
  );
}
