"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Grid = { headers: string[]; rows: string[][] };
type FieldKey = "symbol" | "direction" | "date" | "lots" | "pnl" | "commissions" | "swap" | "entry" | "stop" | "exit" | "ticket";

const FIELDS: { key: FieldKey; label: string; required?: boolean; keys: RegExp; pick: "first" | "last" }[] = [
  { key: "symbol", label: "Symbol", required: true, keys: /symbol|instrument/i, pick: "first" },
  { key: "direction", label: "Direction / type", keys: /type|direction|side/i, pick: "first" },
  { key: "date", label: "Close date", required: true, keys: /close.*time|close.*date|time|date/i, pick: "last" },
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
  // 1) The close datetime column is titled just "Close".
  if (map.date < 0) {
    const i = lower.indexOf("close");
    if (i >= 0) map.date = i;
  }
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
  // Off by default: rows whose ticket already exists are left untouched.
  // On: re-import overwrites those existing trades with the file's values.
  const [override, setOverride] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
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
        // deposits and withdrawals under pseudo-symbols like "USCASH".
        const rawSym = (col(r, "symbol") ?? "").trim();
        if (/cash|deposit|withdraw|balance|credit/i.test(rawSym)) return null;
        const dir = (col(r, "direction") ?? "").toLowerCase();
        const profit = num(col(r, "pnl"));
        const commissions = num(col(r, "commissions")) ?? 0;
        const swap = num(col(r, "swap")) ?? 0;
        return {
          traded_on: date,
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

  async function doImport() {
    setImporting(true);
    setResult(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setResult("Not signed in."); setImporting(false); return; }
    const userId = u.user.id;

    // Which of this file's tickets already exist? Look them up in batches
    // (a blanket select is capped at PostgREST's 1000-row default).
    const wantedExtIds = Array.from(
      new Set(trades.map((t) => t.ext_id).filter((x): x is string => !!x))
    );
    const existingExtIds = new Set<string>();
    for (let i = 0; i < wantedExtIds.length; i += 300) {
      const chunk = wantedExtIds.slice(i, i + 300);
      const { data: existing, error } = await supabase
        .from("trades")
        .select("ext_id")
        .in("ext_id", chunk);
      if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      for (const x of (existing as { ext_id: string }[]) ?? []) existingExtIds.add(x.ext_id);
    }

    // A single MT5/MT4 position can span several deal rows that share one
    // ticket, so we never assume the ticket is unique.
    let toInsert: (typeof trades[number] & { user_id: string })[];
    let skipped = 0;
    let overwritten = 0;
    if (override) {
      // Replace every trade carrying one of this file's tickets: delete them,
      // then insert the file's rows fresh. Preserves multi-row positions and
      // clears out any duplicates left by earlier imports.
      for (let i = 0; i < wantedExtIds.length; i += 300) {
        const chunk = wantedExtIds.slice(i, i + 300);
        const { error } = await supabase.from("trades").delete().in("ext_id", chunk);
        if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      }
      overwritten = existingExtIds.size;
      toInsert = trades.map((t) => ({ ...t, user_id: userId }));
    } else {
      // Skip any ticket already imported; add only genuinely new rows.
      const rows = trades.filter((t) => !(t.ext_id && existingExtIds.has(t.ext_id)));
      skipped = trades.length - rows.length;
      toInsert = rows.map((t) => ({ ...t, user_id: userId }));
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from("trades").insert(chunk);
      if (error) { setResult(`Import error: ${error.message}`); setImporting(false); return; }
      inserted += chunk.length;
    }
    setImporting(false);
    const parts = [`imported ${inserted}`];
    if (overwritten) parts.push(`replaced ${overwritten} existing ${overwritten === 1 ? "ticket" : "tickets"}`);
    if (skipped) parts.push(`skipped ${skipped} already imported`);
    setResult(`Done: ${parts.join(", ")}. Closing...`);
    onImported();
    setTimeout(onClose, 1400);
  }

  const missingRequired = FIELDS.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>Import trades</h2>
            <p className="mt-1 text-sm text-muted">
              Export your trade history from your platform (in MT4/MT5: History tab, right-click, Report, save as HTML, or export CSV), then upload it here.
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
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Preview ({trades.length} trades detected)
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="text-dim">
                    <tr className="whitespace-nowrap">
                      <th className="p-2">Date</th><th className="p-2">Pair</th><th className="p-2">Dir</th>
                      <th className="p-2">Lots</th><th className="p-2">Entry</th><th className="p-2">Stop</th>
                      <th className="p-2">Exit</th><th className="p-2">PnL</th><th className="p-2">Fees</th>
                      <th className="p-2">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 10).map((t, i) => (
                      <tr key={i} className="whitespace-nowrap border-t border-border" style={{ fontFamily: "var(--font-mono)" }}>
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
              {trades.length === 0 && (
                <p className="mt-2 text-xs text-danger">
                  No trades detected. Check the column mapping above, especially Close date and Symbol.
                </p>
              )}
            </div>

            <label className="mt-5 flex items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span>
                Overwrite existing trades
                <span className="block text-xs text-dim">
                  Off by default: trades already imported (same ticket) are left as they are, only new ones are added. Turn on to overwrite them with this file&apos;s values.
                </span>
              </span>
            </label>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={doImport}
                disabled={importing || trades.length === 0 || missingRequired.length > 0}
                className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {importing ? "Importing..." : `Import ${trades.length} trades`}
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
