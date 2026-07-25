"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { captureChartArea } from "@/lib/captureChart";
import { usePairs } from "@/lib/usePairs";

type Analysis = {
  id: string;
  symbol: string;
  timeframe: string | null;
  direction: string | null;
  notes: string | null;
  image_path: string | null;
  created_at: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const BUCKET = "entry-models";

export default function AnalysisPanel({
  defaultSymbol,
  defaultTimeframe,
  onClose,
  onLoadSymbol,
}: {
  defaultSymbol: string;
  defaultTimeframe?: string;
  onClose: () => void;
  onLoadSymbol?: (symbol: string) => void;
}) {
  const supabase = createClient();
  const watchlist = usePairs();
  const [items, setItems] = useState<Analysis[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Analysis | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState(defaultTimeframe ?? "1H");
  const [direction, setDirection] = useState("neutral");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  function attach(f: File | null) {
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  // Grab the chart via the shared Screen Capture helper. The panel hides
  // itself during capture so the chart is visible behind the share prompt.
  async function captureChart() {
    setErr(null);
    setCapturing(true);
    const r = await captureChartArea();
    setCapturing(false);
    if (r.ok) {
      attach(new File([r.blob], `chart-${symbol.replace(/\W/g, "")}-${Date.now()}.png`, { type: "image/png" }));
    } else if (r.reason === "unsupported") {
      setErr("Screen capture is not supported in this browser. Attach a screenshot manually.");
    } else if (r.reason === "failed") {
      setErr("Could not read the captured frame. Attach a screenshot manually.");
    }
    // cancelled: user dismissed the prompt, not an error
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("chart_analyses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setErr(
        /relation .* does not exist|chart_analyses/.test(error.message)
          ? "Run migration 0005_chart_analyses.sql in Supabase."
          : error.message
      );
      return;
    }
    const rows = (data as Analysis[]) ?? [];
    setItems(rows);
    const withImg = rows.filter((r) => r.image_path);
    const signed = await Promise.all(
      withImg.map((r) => supabase.storage.from(BUCKET).createSignedUrl(r.image_path!, 3600))
    );
    const map: Record<string, string> = {};
    withImg.forEach((r, i) => {
      const u = signed[i]?.data?.signedUrl;
      if (u) map[r.id] = u;
    });
    setUrls(map);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes the viewer first, then the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setViewing((v) => {
        if (v) return null;
        onClose();
        return v;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not signed in.");
      setSaving(false);
      return;
    }
    let image_path: string | null = null;
    if (file) {
      const path = `${u.user.id}/analysis/${uid()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) {
        setErr(`Upload failed: ${upErr.message}`);
        setSaving(false);
        return;
      }
      image_path = path;
    }
    const { error } = await supabase.from("chart_analyses").insert({
      user_id: u.user.id,
      symbol,
      timeframe: timeframe || null,
      direction,
      notes: notes || null,
      image_path,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setNotes("");
    attach(null);
    setAdding(false);
    load();
  }

  async function del(a: Analysis) {
    if (a.image_path) await supabase.storage.from(BUCKET).remove([a.image_path]);
    await supabase.from("chart_analyses").delete().eq("id", a.id);
    load();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 ${capturing ? "invisible" : ""}`}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>Analysis log</h2>
          <div className="flex items-center gap-2">
            {!adding && (
              <button onClick={() => setAdding(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">+ Save analysis</button>
            )}
            <button onClick={onClose} className="rounded-md p-2 text-muted hover:text-foreground" aria-label="Close">✕</button>
          </div>
        </div>

        {err && <p className="mb-3 text-sm text-danger">{err}</p>}

        {adding && (
          <div className="mb-5 space-y-3 rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Symbol">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} list="analysis-pairs" className="jfield" />
                <datalist id="analysis-pairs">
                  {watchlist.map((p) => (<option key={p} value={p} />))}
                </datalist>
              </Field>
              <Field label="Timeframe"><input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="1H, 15m..." className="jfield" /></Field>
              <Field label="Bias">
                <select value={direction} onChange={(e) => setDirection(e.target.value)} className="jfield">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                  <option value="neutral">Neutral</option>
                </select>
              </Field>
              <div className="col-span-2">
              <Field label="Screenshot (recommended)">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={captureChart}
                    disabled={capturing}
                    className="rounded-lg border border-border2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
                  >
                    {capturing ? "Capturing..." : "Capture chart"}
                  </button>
                  <label className="cursor-pointer text-xs text-accent2 hover:underline">
                    or attach a file
                    <input type="file" accept="image/*" onChange={(e) => attach(e.target.files?.[0] ?? null)} className="hidden" />
                  </label>
                </div>
                <span className="mt-1 block text-xs text-dim">
                  Pick &quot;This Tab&quot; in the share prompt and the app crops to the
                  chart for you. Drawings cannot be restored later - the
                  screenshot is what you will reopen.
                </span>
              </Field>
              </div>
            </div>
            {preview && (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Screenshot to attach" className="max-h-36 rounded-lg border border-border" />
                <button
                  type="button"
                  onClick={() => attach(null)}
                  className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger"
                >
                  Remove
                </button>
              </div>
            )}
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Your read on the setup..." className="jfield resize-y" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        )}

        {items.length === 0 && !adding && <p className="text-sm text-muted">No saved analysis yet. Take a screenshot of your chart and save your read.</p>}

        <div className="space-y-3">
          {items.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewing(a)}
              onKeyDown={(e) => { if (e.key === "Enter") setViewing(a); }}
              className="cursor-pointer rounded-xl border border-border p-3 transition hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{a.symbol}</span>
                  {a.timeframe && <span className="text-dim">{a.timeframe}</span>}
                  {a.direction && (
                    <span className={`rounded px-1.5 py-0.5 text-xs ${a.direction === "long" ? "bg-success/15 text-success" : a.direction === "short" ? "bg-danger/15 text-danger" : "bg-surface2 text-muted"}`}>
                      {a.direction}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dim">{new Date(a.created_at).toLocaleDateString()}</span>
                  {confirmingId === a.id ? (
                    <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { setConfirmingId(null); del(a); }}
                        className="rounded-md bg-danger/15 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/25"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmingId(a.id); }}
                      className="rounded-md p-2 text-muted transition hover:bg-danger/15 hover:text-danger"
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {a.notes && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{a.notes}</p>}
              {urls[a.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[a.id]} alt={`${a.symbol} analysis screenshot`} className="mt-2 max-h-40 rounded-lg border border-border" />
              ) : a.image_path ? (
                <p className="mt-2 text-xs text-dim">Screenshot attached - open to view.</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:p-6 sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-medium" style={{ fontFamily: "var(--font-display)" }}>{viewing.symbol}</span>
                {viewing.timeframe && <span className="text-sm text-dim">{viewing.timeframe}</span>}
                {viewing.direction && (
                  <span className={`rounded px-1.5 py-0.5 text-xs ${viewing.direction === "long" ? "bg-success/15 text-success" : viewing.direction === "short" ? "bg-danger/15 text-danger" : "bg-surface2 text-muted"}`}>
                    {viewing.direction}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 gap-y-2">
                <span className="text-xs text-dim">
                  {new Date(viewing.created_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
                {onLoadSymbol && (
                  <button
                    onClick={() => { onLoadSymbol(viewing.symbol); setViewing(null); onClose(); }}
                    className="rounded-md border border-border2 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Load on chart
                  </button>
                )}
                {urls[viewing.id] && (
                  <a href={urls[viewing.id]} target="_blank" rel="noreferrer" className="text-xs text-accent2 hover:underline">
                    Open full size
                  </a>
                )}
                <button onClick={() => setViewing(null)} className="rounded-md p-1.5 text-muted hover:text-foreground" aria-label="Close viewer">✕</button>
              </div>
            </div>
            {viewing.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-muted">{viewing.notes}</p>}
            {urls[viewing.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[viewing.id]} alt={`${viewing.symbol} analysis screenshot`} className="w-full rounded-lg border border-border" />
            ) : viewing.image_path ? (
              <p className="text-sm text-dim">Screenshot link expired - close and reopen the log to refresh it.</p>
            ) : (
              <p className="text-sm text-dim">
                No screenshot was attached to this analysis. The embedded chart
                cannot restore drawings, so attach a screenshot when saving to
                keep the visual.
              </p>
            )}
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
