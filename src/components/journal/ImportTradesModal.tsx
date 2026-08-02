"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Grid = { headers: string[]; rows: string[][] };
type FieldKey = "symbol" | "direction" | "date" | "opened" | "lots" | "pnl" | "commissions" | "swap" | "entry" | "stop" | "exit" | "ticket";

const FIELDS: { key: FieldKey; label: string; required?: boolean; keys: RegExp; pick: "first" | "last" }[] = [
  { key: "symbol", label: "Symbol", required: true, keys: /symbol|instrument/i, pick: "first" },
  { key: "direction", label: "Direction / type", keys: /type|direction|side/i, pick: "first" },
  { key: "date", label: "Close date", required: true, keys: /close.*time|close.*date|time|date/i, pick: "last" },
  // MT5 reports carry two "Time" columns: the FIRST is the open. Powers
  // durations (migration 0018); optional everywhere else.
  { key: "opened", label: "Open time", keys: /open.*time|open.*date|^\s*time\s*$/i, pick: "first" },
  { key: "lots", label: "Lots / volume", keys: /volume|lots|size|qty/i, pick: "first" },
  { key: "pnl", label: "Gross profit", required: true, keys: /profit|pnl|p.?\/.?l|net/i, pick: "last" },
  { key: "commissions", label: "Commissions", keys: /commission|comm|fee/i, pick: "first" },
  { key: "swap", label: "Swap", keys: /swap/i, pick: "first" },
  { key: "entry", label: "Entry price", keys: /open.*price|price.*open|entry/i, pick: "first" },
  { key: "stop", label: "Stop loss (SL)", keys: /^s\/?l$|stop.?loss/i, pick: "first" },
  { key: "exit", label: "Exit price", keys: /close.*price|price.*close|exit/i, pick: "last" },
  { key: "ticket", label: "Ticket / position", keys: /ticket|position|deal|order/i, pick: "first" },
];

function detectDelimiter(line: string) {
  const counts: [string, number][] = [
    ["\t", (line.match(/\t/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    [",", (line.match(/,/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function parseCSV(text: string): Grid {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim() !== "")).map((r) => r.map((x) => x.trim()));
  return { headers: clean[0] ?? [], rows: clean.slice(1) };
}

function parseHTML(text: string): Grid {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  let best: string[][] = [];
  for (const t of tables) {
    const rows = Array.from(t.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim())
    );
    if (rows.length > best.length) best = rows;
  }
  const headerIdx = best.findIndex((r) => r.some((c) => /symbol|instrument/i.test(c)) && r.some((c) => /profit|price|volume/i.test(c)));
  const hi = headerIdx >= 0 ? headerIdx : 0;
  const headers = best[hi] ?? [];
  const rows = best.slice(hi + 1).filter((r) => r.length >= headers.length - 1 && r.some((x) => x !== ""));
  return { headers, rows };
}

function normalizeSymbol(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length === 6 && !raw.includes("/")) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return raw.trim();
}
function parseDate(raw: string): string | null {
  let date: string | null = null;
  const iso = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (iso) date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  else {
    const dmy = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  if (!date) return null;
  // Keep the close time when the report has one (MT5: "2026.07.21 14:33:12").
  const time = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (time) {
    return `${date} ${time[1].padStart(2, "0")}:${time[2]}:${time[3] ?? "00"}`;
  }
  return date;
}
function num(s: string | undefined): number | null {
  if (!s) return null;
  let t = s.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function autoMap(headers: string[]): Record<FieldKey, number> {
  const map = {} as Record<FieldKey, number>;
  for (const f of FIELDS) {
    const matches = headers.map((h, i) => ({ h, i })).filter((x) => f.keys.test(x.h));
    map[f.key] = matches.length ? (f.pick === "last" ? matches[matches.length - 1].i : matches[0].i) : -1;
  }
  // FTMO/MT5 CSV conventions the generic patterns cannot see:
  const lower = headers.map((h) => h.trim().toLowerCase());
  // 1) The close datetime column is titled just "Close" (and "Open" for the
  //    open time).
  if (map.date < 0) {
    const i = lower.indexOf("close");
    if (i >= 0) map.date = i;
  }
  if (map.opened < 0) {
    const i = lower.indexOf("open");
    if (i >= 0) map.opened = i;
  }
  // A single "Time" column is the close, not the open.
  if (map.opened >= 0 && map.opened === map.date) map.opened = -1;
  // 2) Two bare "Price" columns: the first (after Symbol) is the entry,
  //    the second (after Close) is the exit.
  const prices = lower
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h === "price")
    .map((x) => x.i);
  if (prices.length >= 2) {
    if (map.entry < 0) map.entry = prices[0];
    if (map.exit < 0 || map.exit === map.entry) map.exit = prices[prices.length - 1];
  } else if (prices.length === 1 && map.entry < 0) {
    map.entry = prices[0];
  }
  return map;
}

export default function ImportTradesModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const supabase = createClient();
  const [grid, setGrid] = useState<Grid | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // How the import writes to the journal:
  //  replace - default: every file row overwrites the matching trade (by
  //            ticket) and new ones are added, so no duplicates
  //  select  - import only the ticked rows; each replaces its ticket match,
  //            the rest of the journal is left alone
  //  wipe    - delete ALL existing trades first, then import the whole file
  const [mode, setMode] = useState<"replace" | "select" | "wipe">("replace");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const lastIdx = useRef<number | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setSelected(new Set());
    setConfirmWipe(false);
    lastIdx.current = null;
    const text = await file.text();
    const g = /\.html?$/i.test(file.name) || /<table/i.test(text) ? parseHTML(text) : parseCSV(text);
    setGrid(g);
    setMapping(autoMap(g.headers));
  }

  const trades = useMemo(() => {
    if (!grid) return [];
    const col = (r: string[], k: FieldKey) => (mapping[k] >= 0 ? r[mapping[k]] : undefined);
    return grid.rows
      .map((r) => {
        const date = parseDate(col(r, "date") ?? "");
        if (!date) return null;
        // Skip non-trade rows: FTMO/MT5 reports include cash adjustments,
        // deposits and withdrawals under pseudo-symbols like "USCASH". But do
        // NOT skip real instruments whose symbol ends in ".cash" (e.g.
        // US30.cash, US100.cash - index CFDs). The dot before "cash" tells the
        // two apart: "USCASH" is an adjustment, "US30.cash" is a tradable.
        const rawSym = (col(r, "symbol") ?? "").trim();
        if (/deposit|withdraw|balance|credit/i.test(rawSym) || /(^|[^.])cash/i.test(rawSym)) return null;
        const dir = (col(r, "direction") ?? "").toLowerCase();
        const profit = num(col(r, "pnl"));
        const commissions = num(col(r, "commissions")) ?? 0;
        const swap = num(col(r, "swap")) ?? 0;
        // Open time must precede the close to count; broker rows sometimes
        // repeat the close in both columns.
        const opened = parseDate(col(r, "opened") ?? "");
        return {
          traded_on: date,
          opened_at: opened && opened < date ? opened : null,
          pair: normalizeSymbol(col(r, "symbol") ?? ""),
          direction: dir.includes("buy") ? "long" : dir.includes("sell") ? "short" : dir.includes("long") ? "long" : dir.includes("short") ? "short" : null,
          size_lots: num(col(r, "lots")),
          pnl: profit == null ? null : Math.round((profit + commissions + swap) * 100) / 100,
          commission: commissions || swap ? Math.round((commissions + swap) * 100) / 100 : null,
          entry_price: num(col(r, "entry")),
          // SL/TP of 0 means "no stop set" in MT5, not a stop at price zero.
          stop_price: num(col(r, "stop")) || null,
          exit_price: num(col(r, "exit")),
          ext_id: (col(r, "ticket") ?? "").trim() || null,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null && t.pair !== "");
  }, [grid, mapping]);

  // Row selection for "Choose which to replace". Plain click toggles one row;
  // Shift-click selects the whole range from the last-clicked row.
  function toggleRow(i: number, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastIdx.current != null) {
        const [a, b] = lastIdx.current < i ? [lastIdx.current, i] : [i, lastIdx.current];
        for (let k = a; k <= b; k++) next.add(k);
      } else if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
    lastIdx.current = i;
  }

  async function doImport() {
    setImporting(true);
    setResult(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setResult("Not signed in."); setImporting(false); return; }
    const userId = u.user.id;

    // Rows to insert: the whole file, or just the ticked ones in select mode.
    let rows = mode === "select" ? trades.filter((_, i) => selected.has(i)) : trades;
    let wiped = 0;
    let replaced = 0;

    if (mode === "wipe") {
      // Full reset: delete every existing trade for this user, then import all.
      const { count } = await supabase
        .from("trades")
        .select("id", { count: "exact", head: true });
      const { error } = await supabase.from("trades").delete().eq("user_id", userId);
      if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      wiped = count ?? 0;
      rows = trades;
    } else {
      // replace / select: delete existing trades that share a ticket with the
      // rows we are about to import, so those get overwritten (no duplicates).
      const extIds = Array.from(new Set(rows.map((t) => t.ext_id).filter((x): x is string => !!x)));
      for (let i = 0; i < extIds.length; i += 300) {
        const chunk = extIds.slice(i, i + 300);
        const { count } = await supabase
          .from("trades")
          .select("id", { count: "exact", head: true })
          .in("ext_id", chunk);
        replaced += count ?? 0;
        const { error } = await supabase.from("trades").delete().in("ext_id", chunk);
        if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      }
    }

    const toInsert = rows.map((t) => ({ ...t, user_id: userId }));
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      let chunk: Record<string, unknown>[] = toInsert.slice(i, i + 500);
      let { error } = await supabase.from("trades").insert(chunk);
      // opened_at ships code-first (migration 0018): retry without it when
      // the column doesn't exist yet.
      if (error && /opened_at/.test(error.message)) {
        chunk = chunk.map(({ opened_at: _o, ...rest }) => rest);
        ({ error } = await supabase.from("trades").insert(chunk));
      }
      if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      inserted += chunk.length;
    }

    setImporting(false);
    const parts: string[] = [];
    if (wiped) parts.push(`wiped ${wiped}`);
    parts.push(`imported ${inserted}`);
    if (replaced) parts.push(`replaced ${replaced} existing`);
    setResult(`Done: ${parts.join(", ")}. Closing...`);
    onImported();
    // Show the result long enough to read, then close.
    setTimeout(onClose, 2200);
  }

  const missingRequired = FIELDS.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);

  // Escape closes, matching the backdrop-click rule: never mid-import, and
  // not once a file is loaded (to protect the mapping work).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing && !grid) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importing, grid, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // Click outside closes - but never mid-import, and never silently
        // after a file is loaded (that state took effort to set up).
        if (e.target !== e.currentTarget || importing) return;
        if (!grid) onClose();
      }}
    >
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>Import trades</h2>
            <p className="mt-1 text-sm text-muted">
              Upload your broker&apos;s trade history export (HTML or CSV).
            </p>
          </div>
          <button onClick={onClose} className="-m-2 shrink-0 rounded-md p-2 text-muted hover:text-foreground" aria-label="Close">✕</button>
        </div>

        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border2 py-6 text-sm text-muted transition hover:border-accent hover:text-accent2">
          {fileName ? `Selected: ${fileName}` : "Choose file (.html or .csv)"}
          <input type="file" accept=".csv,.html,.htm,.txt" onChange={onFile} className="hidden" />
        </label>

        {grid && (
          <>
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Map columns</div>
              <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1 block text-xs text-dim">
                      {f.label}{f.required && <span className="text-danger"> *</span>}
                    </span>
                    <select
                      value={mapping[f.key] ?? -1}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                      className="jfield"
                    >
                      <option value={-1}>—</option>
                      {grid.headers.map((h, i) => (<option key={i} value={i}>{h || `Column ${i + 1}`}</option>))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Preview ({trades.length} trades detected)
                </span>
                {mode === "select" && trades.length > 0 && (
                  <span className="flex items-center gap-3 text-xs">
                    <button type="button" onClick={() => setSelected(new Set(trades.map((_, i) => i)))} className="text-accent2 hover:underline">
                      Select all
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())} className="text-muted hover:text-foreground">
                      Clear ({selected.size})
                    </button>
                  </span>
                )}
              </div>
              <div className={`overflow-auto rounded-lg border border-border ${mode === "select" ? "max-h-72" : "overflow-x-auto"}`}>
                <table className="w-full text-left text-xs">
                  <thead className="text-dim">
                    <tr className="whitespace-nowrap">
                      {mode === "select" && <th className="w-8 p-2"></th>}
                      <th className="p-2">Date</th><th className="p-2">Pair</th><th className="p-2">Dir</th>
                      <th className="p-2">Lots</th><th className="p-2">Entry</th><th className="p-2">Stop</th>
                      <th className="p-2">Exit</th><th className="p-2">PnL</th><th className="p-2">Fees</th>
                      <th className="p-2">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mode === "select" ? trades : trades.slice(0, 10)).map((t, i) => (
                      <tr
                        key={i}
                        onClick={mode === "select" ? (e) => toggleRow(i, e.shiftKey) : undefined}
                        className={`whitespace-nowrap border-t border-border ${mode === "select" ? "cursor-pointer select-none" : ""} ${mode === "select" && selected.has(i) ? "bg-accent-soft" : ""}`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {mode === "select" && (
                          <td className="p-2">
                            <input type="checkbox" readOnly checked={selected.has(i)} className="h-4 w-4 accent-[var(--accent)]" />
                          </td>
                        )}
                        <td className="p-2">{t.traded_on.slice(0, 16)}</td>
                        <td className="p-2" style={{ fontFamily: "var(--font-sans)" }}>{t.pair}</td>
                        <td className="p-2" style={{ fontFamily: "var(--font-sans)" }}>{t.direction ?? "-"}</td>
                        <td className="p-2">{t.size_lots ?? "-"}</td>
                        <td className="p-2">{t.entry_price ?? "-"}</td>
                        <td className="p-2">{t.stop_price ?? "-"}</td>
                        <td className="p-2">{t.exit_price ?? "-"}</td>
                        <td className="p-2">{t.pnl ?? "-"}</td>
                        <td className="p-2">{t.commission ?? "-"}</td>
                        <td className="p-2">{t.ext_id ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mode === "select" ? (
                <p className="mt-1 text-xs text-dim">Click rows to select. Shift-click for a range.</p>
              ) : trades.length > 10 ? (
                <p className="mt-1 text-xs text-dim">Showing first 10 of {trades.length}.</p>
              ) : null}
              {trades.length === 0 && (
                <p className="mt-2 text-xs text-danger">
                  No trades detected. Check the column mapping above, especially Close date and Symbol.
                </p>
              )}
            </div>

            <fieldset className="mt-5 space-y-2">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">On import</legend>
              {([
                ["replace", "Replace with this file", "Each row overwrites the matching trade (by ticket); new trades are added. No duplicates."],
                ["select", "Replace selected rows only", "Tick rows above; only those import, each replacing its match. The rest of the journal is untouched."],
                ["wipe", "Wipe all, then import", "Deletes every existing trade first. Cannot be undone."],
              ] as const).map(([val, title, desc]) => (
                <label key={val} className="flex items-start gap-2.5 text-sm text-muted">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === val}
                    onChange={() => { setMode(val); setConfirmWipe(false); }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span>
                    {title}
                    <span className={`block text-xs ${val === "wipe" ? "text-danger" : "text-dim"}`}>{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {mode === "wipe" && confirmWipe && (
              <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                This permanently deletes ALL your existing trades and replaces them with this file. Click the button again to confirm.
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  if (mode === "wipe" && !confirmWipe) { setConfirmWipe(true); return; }
                  doImport();
                }}
                disabled={importing || trades.length === 0 || missingRequired.length > 0 || (mode === "select" && selected.size === 0)}
                className={`rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 ${mode === "wipe" ? "bg-danger" : "bg-accent"}`}
              >
                {importing
                  ? "Importing..."
                  : mode === "wipe"
                    ? confirmWipe
                      ? `Confirm: wipe all and import ${trades.length}`
                      : `Wipe all and import ${trades.length}`
                    : mode === "select"
                      ? `Import ${selected.size} selected`
                      : `Import ${trades.length} trades`}
              </button>
              {missingRequired.length > 0 && (
                <span className="text-xs text-dim">Map: {missingRequired.map((f) => f.label).join(", ")}</span>
              )}
              {result && <span className="text-sm text-success">{result}</span>}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
