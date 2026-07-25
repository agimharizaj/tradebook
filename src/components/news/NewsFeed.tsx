"use client";

import { useEffect, useState } from "react";

type Item = { title: string; link: string; pubDate: string; body: string };

function ago(dateStr: string) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NewsFeed({ height = 720 }: { height?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        if (d.error || (d.items ?? []).length === 0) setErr(true);
        setLoading(false);
      })
      .catch(() => {
        setErr(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="overflow-y-auto" style={{ height }}>
      {loading && <p className="p-3 text-sm text-muted">Loading headlines...</p>}
      {!loading && err && (
        <p className="p-3 text-sm text-dim">News feed is unavailable right now. Try again shortly.</p>
      )}
      <div className="space-y-2">
        {items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="rounded-lg border border-border bg-surface2/40">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span className="text-sm font-medium leading-snug">{it.title}</span>
                <span className="shrink-0 text-[11px] text-dim">{ago(it.pubDate)}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                    {it.body || "No preview available."}
                  </p>
                  <a
                    href={it.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-accent2 hover:underline"
                  >
                    Open source article
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
