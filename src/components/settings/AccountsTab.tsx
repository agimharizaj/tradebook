"use client";

// Settings > Accounts: the prop-firm account ledger. Create accounts, edit
// their per-account guardrails, and record outcomes - Passed / Failed /
// Closed - with one-click successor creation so the journey (10K failed ->
// 10K passed -> 100K funded) stays linked. Failed accounts keep their full
// history; nothing is deleted. New accounts prefill their guardrails from
// the Settings defaults.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MoneyOrPct, WindowPicker } from "@/components/RiskFields";
import { withCommas } from "@/lib/format";
import {
  ACCOUNT_PHASES,
  ALL_ACCOUNTS,
  accountStatusTone,
  fetchAccounts,
  getSelectedAccountId,
  setSelectedAccountId,
  type Account,
} from "@/lib/accounts";
import type { UserSettings } from "@/lib/settings";
import PairFlag from "@/components/PairFlag";
import { moneySigned } from "@/lib/format";

type UnassignedTrade = {
  id: string;
  traded_on: string;
  pair: string | null;
  direction: string | null;
  pnl: number | null;
};

type Draft = {
  id: string | null;
  name: string;
  firm: string;
  phase: string;
  size: string;
  currency: string;
  max_trades_per_day: string;
  max_daily_loss: string;
  max_daily_profit: string;
  trading_window: string;
  trading_window_2: string;
  notes: string;
  successor_of: string | null;
};

function emptyDraft(defaults: UserSettings, cur: string): Draft {
  return {
    id: null,
    name: "",
    firm: "",
    phase: "challenge",
    size: "",
    currency: cur,
    max_trades_per_day:
      defaults.max_trades_per_day != null ? String(defaults.max_trades_per_day) : "",
    max_daily_loss: defaults.max_daily_loss ?? "",
    max_daily_profit: defaults.max_daily_profit ?? "",
    trading_window: defaults.trading_window ?? "",
    trading_window_2: defaults.trading_window_2 ?? "",
    notes: "",
    successor_of: null,
  };
}

export default function AccountsTab({
  defaults,
  cur,
}: {
  defaults: UserSettings;
  cur: string;
}) {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [unassigned, setUnassigned] = useState(0);
  const [attachTo, setAttachTo] = useState("");
  // Selective attach: expandable list of the unassigned trades with checkboxes
  // and a date-range filter (imports often mix several old accounts).
  const [pickList, setPickList] = useState<UnassignedTrade[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickFrom, setPickFrom] = useState("");
  const [pickTo, setPickTo] = useState("");
  // Two-step delete: the confirm shows how many trades will detach.
  const [confirmDelete, setConfirmDelete] = useState<{ account: Account; trades: number } | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    const { accounts: a, available: ok } = await fetchAccounts(supabase);
    setAccounts(a);
    setAvailable(ok);
    setLoaded(true);
    if (ok) {
      const { count } = await supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .is("account_id", null);
      setUnassigned(count ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft || !draft.name.trim()) {
      setMsg("Give the account a name.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const sizeNum = parseFloat(draft.size.replace(/,/g, ""));
    const n = parseInt(draft.max_trades_per_day, 10);
    const row = {
      name: draft.name.trim(),
      firm: draft.firm.trim() || null,
      phase: draft.phase || null,
      size: Number.isNaN(sizeNum) ? null : sizeNum,
      currency: draft.currency.trim().toUpperCase() || null,
      max_trades_per_day: Number.isNaN(n) ? null : n,
      max_daily_loss: draft.max_daily_loss.trim() || null,
      max_daily_profit: draft.max_daily_profit.trim() || null,
      trading_window: draft.trading_window.trim() || null,
      trading_window_2: draft.trading_window_2.trim() || null,
      notes: draft.notes.trim() || null,
      successor_of: draft.successor_of,
    };
    const { data, error } = draft.id
      ? await supabase.from("accounts").update(row).eq("id", draft.id).select("id").single()
      : await supabase
          .from("accounts")
          .insert({ user_id: u.user.id, ...row })
          .select("id")
          .single();
    setSaving(false);
    if (error) {
      setMsg(`Could not save: ${error.message}`);
      return;
    }
    // A brand-new account becomes the working context immediately.
    if (!draft.id && data) setSelectedAccountId((data as { id: string }).id);
    setDraft(null);
    load();
  }

  async function setStatus(a: Account, status: Account["status"]) {
    const { error } = await supabase
      .from("accounts")
      .update({ status, ended_on: status === "active" ? null : new Date().toISOString().slice(0, 10) })
      .eq("id", a.id);
    if (error) {
      setMsg(`Could not update: ${error.message}`);
      return;
    }
    load();
  }

  function startSuccessor(a: Account) {
    setDraft({
      ...emptyDraft(defaults, a.currency ?? cur),
      name: "",
      firm: a.firm ?? "",
      phase: a.status === "passed" ? (a.phase === "challenge" ? "verification" : "funded") : "challenge",
      size: a.size != null ? withCommas(String(a.size)) : "",
      max_trades_per_day: a.max_trades_per_day != null ? String(a.max_trades_per_day) : "",
      max_daily_loss: a.max_daily_loss ?? "",
      max_daily_profit: a.max_daily_profit ?? "",
      trading_window: a.trading_window ?? "",
      trading_window_2: a.trading_window_2 ?? "",
      successor_of: a.id,
    });
  }

  function edit(a: Account) {
    setDraft({
      id: a.id,
      name: a.name,
      firm: a.firm ?? "",
      phase: a.phase ?? "challenge",
      size: a.size != null ? withCommas(String(a.size)) : "",
      currency: a.currency ?? cur,
      max_trades_per_day: a.max_trades_per_day != null ? String(a.max_trades_per_day) : "",
      max_daily_loss: a.max_daily_loss ?? "",
      max_daily_profit: a.max_daily_profit ?? "",
      trading_window: a.trading_window ?? "",
      trading_window_2: a.trading_window_2 ?? "",
      notes: a.notes ?? "",
      successor_of: a.successor_of,
    });
  }

  async function attachUnassigned() {
    if (!attachTo) return;
    const { error } = await supabase
      .from("trades")
      .update({ account_id: attachTo })
      .is("account_id", null);
    if (error) setMsg(`Could not attach: ${error.message}`);
    setPickList(null);
    setPicked(new Set());
    load();
  }

  async function openPicker() {
    const { data, error } = await supabase
      .from("trades")
      .select("id, traded_on, pair, direction, pnl")
      .is("account_id", null)
      .order("traded_on", { ascending: false })
      .limit(500);
    if (error) {
      setMsg(`Could not load trades: ${error.message}`);
      return;
    }
    setPickList((data as UnassignedTrade[]) ?? []);
    setPicked(new Set());
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleHidden(a: Account) {
    const { error } = await supabase
      .from("accounts")
      .update({ hidden: !a.hidden })
      .eq("id", a.id);
    if (error) {
      setMsg(
        /hidden/.test(error.message)
          ? "Hiding needs migration 0020 (accounts.hidden) applied first."
          : `Could not update: ${error.message}`
      );
      return;
    }
    if (!a.hidden && getSelectedAccountId() === a.id) setSelectedAccountId(ALL_ACCOUNTS);
    load();
  }

  async function openDeleteConfirm(a: Account) {
    const { count } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", a.id);
    setConfirmDelete({ account: a, trades: count ?? 0 });
  }

  async function deleteAccount() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("accounts").delete().eq("id", confirmDelete.account.id);
    if (error) {
      setMsg(`Could not delete: ${error.message}`);
      setConfirmDelete(null);
      return;
    }
    // Trades detach automatically (account_id is on delete set null).
    if (getSelectedAccountId() === confirmDelete.account.id) setSelectedAccountId(ALL_ACCOUNTS);
    if (draft?.id === confirmDelete.account.id) setDraft(null);
    setConfirmDelete(null);
    load();
  }

  async function attachPicked() {
    if (!attachTo || picked.size === 0) return;
    const { error } = await supabase
      .from("trades")
      .update({ account_id: attachTo })
      .in("id", Array.from(picked));
    if (error) {
      setMsg(`Could not attach: ${error.message}`);
      return;
    }
    setPickList(null);
    setPicked(new Set());
    load();
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  if (!available) {
    return (
      <p className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
        Accounts need migration 0019 (accounts table + trades.account_id) applied first.
      </p>
    );
  }

  const draftSize = draft ? parseFloat(draft.size.replace(/,/g, "")) : NaN;
  const nameOf = (id: string | null) => accounts.find((x) => x.id === id)?.name;

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-danger">{msg}</p>}

      {/* ledger */}
      {accounts.length === 0 && !draft && (
        <p className="text-sm text-muted">
          No accounts yet. Create your first one - a prop challenge, a funded account, or your
          personal account - and every trade you log gets attached to it.
        </p>
      )}
      {accounts.some((a) => a.hidden) && (
        <button
          onClick={() => setShowHidden((s) => !s)}
          className="text-xs text-dim transition hover:text-foreground"
        >
          {showHidden ? "Conceal hidden accounts" : `Show hidden (${accounts.filter((a) => a.hidden).length})`}
        </button>
      )}
      <div className="space-y-2">
        {accounts.filter((a) => !a.hidden || showHidden).map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border border-border bg-surface2 p-3.5 ${a.hidden ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{a.name}</span>
              {a.firm && <span className="text-xs text-dim">{a.firm}</span>}
              {a.phase && (
                <span className="rounded-full border border-border2 px-2 py-0.5 text-[10px] capitalize text-muted">
                  {a.phase}
                </span>
              )}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${accountStatusTone(a.status)}`}
              >
                {a.status}
              </span>
              {a.size != null && (
                <span className="font-mono text-xs text-muted">
                  {a.currency ?? cur} {a.size.toLocaleString()}
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-dim">
                {a.started_on}
                {a.ended_on ? ` to ${a.ended_on}` : ""}
              </span>
            </div>
            {a.successor_of && nameOf(a.successor_of) && (
              <p className="mt-1 text-[11px] text-dim">Successor of {nameOf(a.successor_of)}</p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                onClick={() => edit(a)}
                className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
              >
                Edit
              </button>
              {a.status === "active" ? (
                <>
                  <button
                    onClick={() => setStatus(a, "passed")}
                    className="rounded-md border border-success/40 px-2.5 py-1 text-xs text-success transition hover:bg-success/10"
                  >
                    Mark passed
                  </button>
                  <button
                    onClick={() => setStatus(a, "failed")}
                    className="rounded-md border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10"
                  >
                    Mark failed
                  </button>
                  <button
                    onClick={() => setStatus(a, "closed")}
                    className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:text-foreground"
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startSuccessor(a)}
                    className="rounded-md border border-accent/50 px-2.5 py-1 text-xs text-accent2 transition hover:bg-accent-soft"
                  >
                    Start successor
                  </button>
                  <button
                    onClick={() => setStatus(a, "active")}
                    className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:text-foreground"
                  >
                    Reopen
                  </button>
                </>
              )}
              <button
                onClick={() => toggleHidden(a)}
                title={a.hidden ? "Show in the switcher and dashboard again" : "Hide from the switcher and dashboard (trades still count in All accounts)"}
                className="ml-auto rounded-md px-2.5 py-1 text-xs text-dim transition hover:bg-surface2 hover:text-foreground"
              >
                {a.hidden ? "Unhide" : "Hide"}
              </button>
              <button
                onClick={() => openDeleteConfirm(a)}
                className="rounded-md px-2.5 py-1 text-xs text-dim transition hover:bg-danger/10 hover:text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!draft && (
        <button
          onClick={() => setDraft(emptyDraft(defaults, cur))}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          + New account
        </button>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Delete {confirmDelete.account.name}?
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              The account entry is removed permanently - there is no undo.{" "}
              {confirmDelete.trades > 0
                ? `Its ${confirmDelete.trades} trade${confirmDelete.trades === 1 ? "" : "s"} stay in your journal and become unassigned.`
                : "It has no trades attached."}{" "}
              If you're recording an outcome, use Mark failed or Close instead - that keeps the history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                className="rounded-lg bg-danger/15 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/25"
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* unassigned trades */}
      {unassigned > 0 && accounts.length > 0 && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-3.5">
          <p className="text-sm text-gold">
            {unassigned} existing {unassigned === 1 ? "trade has" : "trades have"} no account.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={attachTo}
              onChange={(e) => setAttachTo(e.target.value)}
              className="field !w-auto !py-1.5 !text-sm"
              aria-label="Account to attach unassigned trades to"
            >
              <option value="">Choose account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={attachUnassigned}
              disabled={!attachTo}
              className="rounded-lg border border-border2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              Attach all
            </button>
            <button
              onClick={() => (pickList ? setPickList(null) : openPicker())}
              className="rounded-lg border border-border2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              {pickList ? "Hide list" : "Choose trades…"}
            </button>
          </div>

          {pickList && (() => {
            const visible = pickList.filter((t) => {
              const d = t.traded_on.slice(0, 10);
              if (pickFrom && d < pickFrom) return false;
              if (pickTo && d > pickTo) return false;
              return true;
            });
            const allVisiblePicked =
              visible.length > 0 && visible.every((t) => picked.has(t.id));
            return (
            <div className="mt-3 border-t border-gold/30 pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={pickFrom}
                  onChange={(e) => setPickFrom(e.target.value)}
                  className="field !w-auto !px-2 !py-1 !text-xs"
                  aria-label="From date"
                  title="From date"
                />
                <span className="text-xs text-dim">to</span>
                <input
                  type="date"
                  value={pickTo}
                  onChange={(e) => setPickTo(e.target.value)}
                  className="field !w-auto !px-2 !py-1 !text-xs"
                  aria-label="To date"
                  title="To date"
                />
                {(pickFrom || pickTo) && (
                  <button
                    onClick={() => { setPickFrom(""); setPickTo(""); }}
                    className="text-xs text-dim hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (allVisiblePicked) visible.forEach((t) => next.delete(t.id));
                      else visible.forEach((t) => next.add(t.id));
                      return next;
                    })
                  }
                  className="ml-auto text-xs text-accent2 hover:underline"
                >
                  {allVisiblePicked ? "Deselect shown" : `Select shown (${visible.length})`}
                </button>
                <span className="font-mono text-xs text-muted">{picked.size} selected</span>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                {visible.length === 0 && (
                  <p className="py-2 text-center text-xs text-dim">No unassigned trades in this range.</p>
                )}
                {visible.map((t) => {
                  const on = picked.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => togglePick(t.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                        on ? "bg-accent-soft" : "hover:bg-surface2"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? "border-accent bg-accent" : "border-border2"
                        }`}
                        aria-hidden="true"
                      >
                        {on && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-dim">{t.traded_on.slice(0, 10)}</span>
                      <PairFlag pair={t.pair} size={15} />
                      <span className="truncate text-xs">{t.pair ?? "Trade"}</span>
                      <span className={`text-[10px] ${t.direction === "long" ? "text-success" : "text-danger"}`}>
                        {t.direction === "long" ? "Long" : t.direction === "short" ? "Short" : ""}
                      </span>
                      {t.pnl != null && (
                        <span
                          className={`ml-auto font-mono text-[11px] ${t.pnl > 0 ? "text-success" : t.pnl < 0 ? "text-danger" : "text-muted"}`}
                        >
                          {moneySigned(t.pnl, cur)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={attachPicked}
                disabled={!attachTo || picked.size === 0}
                className="mt-2.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Attach {picked.size || ""} selected{!attachTo ? " (choose an account above)" : ""}
              </button>
            </div>
            );
          })()}
        </div>
      )}

      {/* create / edit form */}
      {draft && (
        <div className="rounded-xl border border-border2 bg-surface2 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            {draft.id ? "Edit account" : draft.successor_of ? `New account (successor of ${nameOf(draft.successor_of) ?? "previous"})` : "New account"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Name</span>
              <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="FTMO 100K #2" className="field" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Firm / broker</span>
              <input value={draft.firm} onChange={(e) => set("firm", e.target.value)} placeholder="FTMO" className="field" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Phase</span>
              <select value={draft.phase} onChange={(e) => set("phase", e.target.value)} className="field">
                {ACCOUNT_PHASES.map((p) => (
                  <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Account size</span>
              <input
                inputMode="decimal"
                value={draft.size}
                onChange={(e) => set("size", withCommas(e.target.value))}
                placeholder="100,000"
                className="field"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Currency</span>
              <input value={draft.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} placeholder="USD" className="field" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dim">Max trades / day</span>
              <input inputMode="numeric" value={draft.max_trades_per_day} onChange={(e) => set("max_trades_per_day", e.target.value)} placeholder="5" className="field" style={{ fontFamily: "var(--font-mono)" }} />
            </label>
            <MoneyOrPct
              label="Max daily loss"
              v={draft.max_daily_loss}
              on={(v) => set("max_daily_loss", v)}
              accountSize={Number.isNaN(draftSize) ? 0 : draftSize}
            />
            <MoneyOrPct
              label="Daily profit target"
              v={draft.max_daily_profit}
              on={(v) => set("max_daily_profit", v)}
              accountSize={Number.isNaN(draftSize) ? 0 : draftSize}
            />
            <WindowPicker
              label="Trading window"
              value={draft.trading_window}
              on={(v) => set("trading_window", v)}
            />
            <WindowPicker
              label="Trading window 2 (optional)"
              value={draft.trading_window_2}
              on={(v) => set("trading_window_2", v)}
            />
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-dim">Notes</span>
            <input value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Payout rules, reset dates…" className="field" />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
