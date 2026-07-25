"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  onClose,
}: {
  defaultSymbol: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Analysis[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState("1H");
  const [direction, setDirection] = useState("neutral");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("chart_analyses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setErr(
        /relation .* does not exist|chart_analyses/.test(error.message)
          ? "Run migration 0004_chart_analyses.sql in Supabase."
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
    setFile(null);
    setAdding(false);
    load();
  }

  async function del(a: Analysis) {
    if (a.image_path) await supabase.storage.from(BUCKET).remove([a.image_path]);
    await supabase.from("chart_analyses").delete().eq("id", a.id);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 ring-1 ring-border2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>Analysis log</h2>
          <div className="flex items-center gap-2">
            {!adding && (
              <button onClick={() => setAdding(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">+ Save analysis</button>
            )}
            <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">✕</button>
          </div>
        </div>

        {err && <p className="mb-3 text-sm text-danger">{err}</p>}

        {adding && (
          <div className="mb-5 space-y-3 rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Symbol"><input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="afield" /></Field>
              <Field label="Timeframe"><input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="1H, 15m..." className="afield" /></Field>
              <Field label="Bias">
                <select value={direction} onChange={(e) => setDirection(e.target.value)} className="afield">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                  <option value="neutral">Neutral</option>
                </select>
              </Field>
              <Field label="Screenshot">
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs text-muted" />
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Your read on the setup..." className="afield resize-y" />
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
            <div key={a.id} className="rounded-xl border border-border p-3">
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
                  <button onClick={() => del(a)} className="text-dim hover:text-danger" aria-label="Delete">✕</button>
                </div>
              </div>
              {a.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.notes}</p>}
              {urls[a.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[a.id]} alt="analysis" className="mt-2 max-h-72 rounded-lg border border-border" />
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .afield{width:100%;border-radius:.5rem;border:1px solid var(--border2);background:var(--surface2);color:var(--foreground);padding:.5rem .65rem;font-size:.85rem;outline:none}
        .afield:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
      `}</style>
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
