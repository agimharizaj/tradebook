"use client";

// Add / edit a trade for a given day. Extracted from the old DayModal so the
// journal panel and the trade page can share it. Closes on backdrop click and
// Escape - with a discard confirm when fields have been touched, so a stray
// click can't eat input. "Save & Journal" saves and jumps straight into the
// trade's journal page.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePairs } from "@/lib/usePairs";
import { ENTRY_EMOTIONS } from "@/lib/settings";
import {
  ALL_ACCOUNTS,
  fetchAccounts,
  getSelectedAccountId,
  type Account,
} from "@/lib/accounts";

export type TradeFormTrade = {
  id: string;
  traded_on: string;
  opened_at?: string | null;
  account_id?: string | null;
  pair: string | null;
  direction: string | null;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  size_lots: number | null;
  pnl: number | null;
  r_multiple: number | null;
  emotion: string | null;
  notes: string | null;
  strategy_id: string | null;
};

type Strat = { id: string; name: string };

export default function TradeFormModal({
  day,
  trade,
  strategies,
  onClose,
  onSaved,
}: {
  day: string;
  trade?: TradeFormTrade | null;
  strategies: Strat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const watchlist = usePairs();
  const editing = !!trade;

  const initial = useMemo(
    () => ({
      pair: trade?.pair ?? "",
      direction: trade?.direction ?? "long",
      pnl: trade?.pnl != null ? String(trade.pnl) : "",
      r: trade?.r_multiple != null ? String(trade.r_multiple) : "",
      entry: trade?.entry_price != null ? String(trade.entry_price) : "",
      stop: trade?.stop_price != null ? String(trade.stop_price) : "",
      exit: trade?.exit_price != null ? String(trade.exit_price) : "",
      size: trade?.size_lots != null ? String(trade.size_lots) : "",
      emotion: trade?.emotion ?? "",
      notes: trade?.notes ?? "",
      strategyId: trade?.strategy_id ?? "",
      time:
        trade && trade.traded_on.length > 10 && !/T00:00(:00)?/.test(trade.traded_on.slice(10, 19))
          ? trade.traded_on.slice(11, 16)
          : "",
      openTime:
        trade?.opened_at && trade.opened_at.length > 10
          ? trade.opened_at.slice(11, 16)
          : "",
    }),
    [trade]
  );
  const [f, setF] = useState(initial);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const dirty = useMemo(
    () => (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== initial[k]),
    [f, initial]
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Prop-firm accounts: new trades default to the globally selected account.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>(trade?.account_id ?? "");
  useEffect(() => {
    fetchAccounts(supabase).then(({ accounts: a }) => {
      setAccounts(a);
      if (!trade) {
        const sel = getSelectedAccountId();
        if (sel !== ALL_ACCOUNTS && a.some((x) => x.id === sel)) setAccountId(sel);
        else if (a.length === 1) setAccountId(a[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save(journalAfter: boolean) {
    setSaving(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not signed in.");
      setSaving(false);
      return;
    }
    // Times are entered and shown in UTC (same convention as MT5 history).
    const tradedOn = f.time ? `${day}T${f.time}:00Z` : day;
    const openedAt = f.openTime ? `${day}T${f.openTime}:00Z` : null;
    const payload: Record<string, unknown> = {
      pair: f.pair || null,
      direction: f.direction,
      entry_price: num(f.entry),
      stop_price: num(f.stop),
      exit_price: num(f.exit),
      size_lots: num(f.size),
      pnl: num(f.pnl),
      r_multiple: num(f.r),
      emotion: f.emotion || null,
      notes: f.notes || null,
      strategy_id: f.strategyId || null,
      ...(editing ? (f.time !== initial.time ? { traded_on: tradedOn } : {}) : {}),
      ...(f.openTime !== initial.openTime || !editing ? { opened_at: openedAt } : {}),
      account_id: accountId || null,
    };
    // opened_at (0018) and account_id (0019) ship code-first: retry without
    // whichever column the database says it doesn't have yet.
    const OPTIONAL_COLS = /opened_at|account_id/;
    let id = trade?.id ?? null;
    if (editing && id) {
      const row: Record<string, unknown> = { ...payload };
      let { error } = await supabase.from("trades").update(row).eq("id", id);
      while (error && OPTIONAL_COLS.test(error.message)) {
        const col = error.message.match(OPTIONAL_COLS)![0];
        if (!(col in row)) break;
        delete row[col];
        ({ error } = await supabase.from("trades").update(row).eq("id", id));
      }
      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    } else {
      const row: Record<string, unknown> = { user_id: u.user.id, traded_on: tradedOn, ...payload };
      let { data, error } = await supabase.from("trades").insert(row).select("id").single();
      while (error && OPTIONAL_COLS.test(error.message)) {
        const col = error.message.match(OPTIONAL_COLS)![0];
        if (!(col in row)) break;
        delete row[col];
        ({ data, error } = await supabase.from("trades").insert(row).select("id").single());
      }
      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
      id = (data as { id: string }).id;
    }
    setSaving(false);
    onSaved();
    onClose();
    if (journalAfter && id) router.push(`/journal/trade/${id}`);
  }

  const heading = new Date(day + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>
              {editing ? "Edit trade" : "Add trade"}
            </h2>
            <p className="text-xs text-dim">{heading}</p>
          </div>
          <button onClick={requestClose} className="-m-2 rounded-md p-2 text-muted hover:text-foreground" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-danger">{err}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pair">
            <input value={f.pair} onChange={(e) => set("pair", e.target.value)} placeholder="EUR/USD" list="journal-pairs" className="jfield" />
            <datalist id="journal-pairs">
              {watchlist.map((p) => (<option key={p} value={p} />))}
            </datalist>
            <span className="mt-0.5 block text-[11px]">
              <Link href="/settings?tab=pairs" className="text-accent2 hover:underline">Edit pairs</Link>
            </span>
          </Field>
          <Field label="Direction">
            <select value={f.direction} onChange={(e) => set("direction", e.target.value)} className="jfield">
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </Field>
          <Field label="PnL ($)"><input value={f.pnl} onChange={(e) => set("pnl", e.target.value)} className="jfield" /></Field>
          <Field label="R multiple"><input value={f.r} onChange={(e) => set("r", e.target.value)} className="jfield" /></Field>
          <Field label="Entry"><input inputMode="decimal" value={f.entry} onChange={(e) => set("entry", e.target.value)} className="jfield" /></Field>
          <Field label="Stop"><input inputMode="decimal" value={f.stop} onChange={(e) => set("stop", e.target.value)} className="jfield" /></Field>
          <Field label="Exit"><input inputMode="decimal" value={f.exit} onChange={(e) => set("exit", e.target.value)} className="jfield" /></Field>
          <Field label="Size (lots)"><input inputMode="decimal" value={f.size} onChange={(e) => set("size", e.target.value)} className="jfield" /></Field>
          <Field label="Open time (UTC, optional)"><input type="time" value={f.openTime} onChange={(e) => set("openTime", e.target.value)} className="jfield" /></Field>
          <Field label="Close time (UTC, optional)"><input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className="jfield" /></Field>
          <Field label="Emotion">
            <input value={f.emotion} onChange={(e) => set("emotion", e.target.value)} placeholder="Calm, FOMO..." list="journal-emotions" className="jfield" />
            <datalist id="journal-emotions">
              {ENTRY_EMOTIONS.map((x) => (<option key={x.label} value={x.label} />))}
            </datalist>
          </Field>
          <Field label="Strategy">
            <select value={f.strategyId} onChange={(e) => set("strategyId", e.target.value)} className="jfield">
              <option value="">None</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          {accounts.length > 0 && (
            <Field label="Account">
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="jfield">
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="mt-3">
          <Field label="Notes">
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="jfield resize-y" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={requestClose} className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Save"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Save &amp; Journal
          </button>
        </div>
      </div>

      {confirmDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Discard this trade?
            </h3>
            <p className="mt-1.5 text-sm text-muted">You have unsaved changes.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDiscard(false)}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-danger/15 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/25"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
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
