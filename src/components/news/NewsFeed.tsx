"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = { title: string; link: string; pubDate: string; body: string; source?: string };

function ago(dateStr: string) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function dayLabel(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const key = (x: Date) => x.toDateString();
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const RANGES = [
  { key: "today", label: "Today", hours: 24 },
  { key: "week", label: "Week", hours: 24 * 7 },
  { key: "month", label: "Month", hours: 24 * 31 },
  { key: "all", label: "All", hours: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export default function NewsFeed({ height = 720 }: { height?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [range, setRange] = useState<RangeKey>("week");

  useEffect(() => {
    (async () => {
      let live: Item[] = [];
      try {
        const d = await fetch("/api/news").then((r) => r.json());
        live = d.items ?? [];
      } catch {
        // fall through to the archive
      }

      // RSS feeds only carry ~2 days, so the app archives every headline it
      // sees (migration 0007) and merges the archive back in. Week/Month
      // filters get deeper the longer the app runs.
      const supabase = createClient();
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u.user && live.length) {
          const rows = live.map((it) => ({
            user_id: u.user!.id,
            link: it.link,
            title: it.title,
            source: it.source ?? null,
            body: (it.body || "").slice(0, 2000),
            published_at: Number.isNaN(new Date(it.pubDate).getTime())
              ? null
              : new Date(it.pubDate).toISOString(),
          }));
          // Fire-and-forget; fails silently before the migration runs.
          supabase
            .from("news_items")
            .upsert(rows, { onConflict: "user_id,link", ignoreDuplicates: true })
            .then(() => {});
        }
        const { data: arch } = await supabase
          .from("news_items")
          .select("link, title, source, body, published_at")
          .order("published_at", { ascending: false })
          .limit(600);
        const seen = new Set(live.map((i) => i.link));
        (arch ?? []).forEach((a) => {
          if (a.link && !seen.has(a.link)) {
            live.push({
              title: a.title,
              link: a.link,
              source: a.source ?? undefined,
              pubDate: a.published_at ?? "",
              body: a.body ?? "",
            });
          }
        });
      } catch {
        // archive unavailable: live feed alone still works
      }

      live.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      setItems(live);
      if (live.length === 0) setErr(true);
      setLoading(false);
    })();
  }, []);

  const maxHours = RANGES.find((r) => r.key === range)?.hours ?? Infinity;
  const cutoff = Date.now() - maxHours * 3600 * 1000;
  const visible = items.filter((it) => {
    if (maxHours === Infinity) return true;
    const t = new Date(it.pubDate).getTime();
    return Number.isNaN(t) ? true : t >= cutoff;
  });

  const groups: { label: string; items: { item: Item; idx: number }[] }[] = [];
  visible.forEach((it) => {
    const i = items.indexOf(it);
    const lab = dayLabel(it.pubDate);
    const last = groups[groups.length - 1];
    if (last && last.label === lab) last.items.push({ item: it, idx: i });
    else groups.push({ label: lab, items: [{ item: it, idx: i }] });
  });

  return (
    <div>
      <div
        className="mb-2 flex items-center gap-0.5 rounded-lg border border-border2 bg-surface2/60 p-0.5"
        role="group"
        aria-label="News time range"
      >
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              range === r.key ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

    <div className="overflow-y-auto" style={{ height }}>
      {loading && <p className="p-3 text-sm text-muted">Loading headlines...</p>}
      {!loading && err && (
        <p className="p-3 text-sm text-dim">News feed is unavailable right now. Try again shortly.</p>
      )}
      {!loading && !err && visible.length === 0 && (
        <p className="p-3 text-sm text-dim">
          Nothing in this range. The feed only carries recent headlines, so
          wider ranges show more.
        </p>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="sticky top-0 z-10 bg-card/95 py-1 text-xs font-medium uppercase tracking-wide text-dim backdrop-blur">
              {g.label}
            </div>
            <div className="mt-1 space-y-2">
              {g.items.map(({ item: it, idx: i }) => {
                const isOpen = open === i;
                return (
                  <div key={i} className="rounded-lg border border-border bg-surface2/40">
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="text-sm font-medium leading-snug">{it.title}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-dim">
                          {[it.source, ago(it.pubDate)].filter(Boolean).join(" · ")}
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`mt-0.5 text-dim transition-transform ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </span>
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
        ))}
      </div>
    </div>
    </div>
  );
}
