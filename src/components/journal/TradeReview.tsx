"use client";

// The per-trade journal page (EdgeFlo "review & reflection"). Regular mode:
// trade facts + charts + reflection. Focus mode: charts + reflection only,
// with Previous/Next to walk a whole day fast. Everything autosaves into
// trade_reviews (migration 0014); chart screenshots go to the entry-models
// bucket under <uid>/reviews/<tradeId>/.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { moneySigned } from "@/lib/format";
import { ENTRY_EMOTIONS, EXIT_EMOTIONS } from "@/lib/settings";
import PairFlag from "@/components/PairFlag";
import MicButton from "@/components/MicButton";
import TagInput from "./TagInput";
import TradeFormModal, { type TradeFormTrade } from "./TradeFormModal";

type Trade = TradeFormTrade & { commission: number | null };

type Review = {
  plan_followed: boolean | null;
  strategy_id: string | null;
  strategy_name: string | null;
  confluences: string[];
  management: string[];
  mistakes: string[];
  entry_emotion: string | null;
  exit_emotion: string | null;
  reflection: string | null;
  htf_path: string | null;
  mtf_path: string | null;
  ltf_path: string | null;
};

const EMPTY_REVIEW: Review = {
  plan_followed: null,
  strategy_id: null,
  strategy_name: null,
  confluences: [],
  management: [],
  mistakes: [],
  entry_emotion: null,
  exit_emotion: null,
  reflection: null,
  htf_path: null,
  mtf_path: null,
  ltf_path: null,
};

type Strat = { id: string; name: string };
type Slot = "htf" | "mtf" | "ltf";
const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: "htf", label: "HTF", hint: "Higher timeframe context" },
  { key: "mtf", label: "MTF", hint: "Setup timeframe" },
  { key: "ltf", label: "LTF", hint: "Execution timeframe" },
];

const dayKey = (t: string) => t.slice(0, 10);

// Which indicative sessions were open at this instant (same hours as the
// Sessions page / AI context).
function sessionsAt(at: Date): string {
  const sessions: [string, string, number, number][] = [
    ["Sydney", "Australia/Sydney", 7 * 60, 16 * 60],
    ["Tokyo", "Asia/Tokyo", 9 * 60, 18 * 60],
    ["London", "Europe/London", 8 * 60, 16 * 60 + 30],
    ["New York", "America/New_York", 8 * 60, 17 * 60],
  ];
  const open: string[] = [];
  for (const [name, tz, o, c] of sessions) {
    try {
      const p = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(at);
      const get = (k: string) => p.find((x) => x.type === k)?.value ?? "0";
      const mins = (+get("hour") % 24) * 60 + +get("minute");
      if (mins >= o && mins < c) open.push(name);
    } catch {
      /* ignore */
    }
  }
  return open.length ? open.join(" / ") : "—";
}

export default function TradeReview({ tradeId }: { tradeId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [review, setReview] = useState<Review>(EMPTY_REVIEW);
  const [reviewsAvailable, setReviewsAvailable] = useState(true);
  const [strategies, setStrategies] = useState<Strat[]>([]);
  const [dayIds, setDayIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ confluences: string[]; management: string[]; mistakes: string[] }>({
    confluences: [], management: [], mistakes: [],
  });
  const [imageUrls, setImageUrls] = useState<Partial<Record<Slot, string>>>({});
  const [cur, setCur] = useState("USD");
  const [focus, setFocus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState<Slot | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;

  useEffect(() => {
    setFocus(localStorage.getItem("tb_journal_focus") === "1");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data: t, error: tErr } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .maybeSingle();
    if (tErr || !t) {
      setErr(tErr ? `Could not load trade: ${tErr.message}` : "Trade not found.");
      setLoading(false);
      return;
    }
    const tr = t as Trade;
    setTrade(tr);

    const { data: r, error: rErr } = await supabase
      .from("trade_reviews")
      .select("*")
      .eq("trade_id", tradeId)
      .maybeSingle();
    if (rErr) {
      setReviewsAvailable(false);
    } else {
      setReviewsAvailable(true);
      if (r) {
        const rr = r as Record<string, unknown>;
        setReview({
          plan_followed: (rr.plan_followed as boolean | null) ?? null,
          strategy_id: (rr.strategy_id as string | null) ?? null,
          strategy_name: (rr.strategy_name as string | null) ?? null,
          confluences: (rr.confluences as string[]) ?? [],
          management: (rr.management as string[]) ?? [],
          mistakes: (rr.mistakes as string[]) ?? [],
          entry_emotion: (rr.entry_emotion as string | null) ?? null,
          exit_emotion: (rr.exit_emotion as string | null) ?? null,
          reflection: (rr.reflection as string | null) ?? null,
          htf_path: (rr.htf_path as string | null) ?? null,
          ltf_path: (rr.ltf_path as string | null) ?? null,
          mtf_path: (rr.mtf_path as string | null) ?? null,
        });
      } else {
        // Fresh review defaults to the strategy the trade was tagged with.
        setReview({ ...EMPTY_REVIEW, strategy_id: tr.strategy_id });
      }
    }

    // Same-day trade ids for Previous / Next.
    const day = dayKey(tr.traded_on);
    const { data: dayRows } = await supabase
      .from("trades")
      .select("id, traded_on")
      .gte("traded_on", day)
      .lt("traded_on", `${day}T23:59:59.999Z`)
      .order("traded_on", { ascending: true });
    setDayIds(((dayRows as { id: string }[]) ?? []).map((x) => x.id));
    setLoading(false);
  }, [supabase, tradeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase.from("strategies").select("id, name").then(({ data }) => {
      setStrategies((data as Strat[]) ?? []);
    });
    supabase.auth.getUser().then(({ data }) => {
      const c = data.user?.user_metadata?.account_currency;
      if (typeof c === "string" && c) setCur(c);
    });
    // Tag catalogs from past reviews.
    supabase
      .from("trade_reviews")
      .select("confluences, management, mistakes")
      .limit(400)
      .then(({ data }) => {
        if (!data) return;
        const collect = (k: "confluences" | "management" | "mistakes") =>
          Array.from(
            new Set(
              (data as Record<string, string[] | null>[]).flatMap((row) => row[k] ?? [])
            )
          ).sort();
        setCatalog({
          confluences: collect("confluences"),
          management: collect("management"),
          mistakes: collect("mistakes"),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  // Signed URLs for stored chart screenshots.
  useEffect(() => {
    let cancelled = false;
    async function sign() {
      const next: Partial<Record<Slot, string>> = {};
      for (const s of SLOTS) {
        const path = review[`${s.key}_path` as const];
        if (path) {
          const { data } = await supabase.storage.from("entry-models").createSignedUrl(path, 3600);
          if (data?.signedUrl) next[s.key] = data.signedUrl;
        }
      }
      if (!cancelled) setImageUrls(next);
    }
    sign();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.htf_path, review.mtf_path, review.ltf_path]);

  const persist = useCallback(
    async (r: Review) => {
      if (!reviewsAvailable) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setSaveState("saving");
      const { error } = await supabase
        .from("trade_reviews")
        .upsert({ user_id: u.user.id, trade_id: tradeId, ...r }, { onConflict: "trade_id" });
      if (error) {
        setErr(`Could not save review: ${error.message}`);
        setSaveState("idle");
      } else {
        setErr(null);
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
      }
    },
    [supabase, tradeId, reviewsAvailable]
  );

  function update(patch: Partial<Review>) {
    setReview((r) => {
      const next = { ...r, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 700);
      return next;
    });
  }
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        persist(reviewRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function pickStrategy(id: string) {
    const s = strategies.find((x) => x.id === id);
    update({ strategy_id: id || null, strategy_name: s?.name ?? reviewRef.current.strategy_name });
  }

  async function uploadSlot(slot: Slot, file: File) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !trade) return;
    setUploading(slot);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${u.user.id}/reviews/${trade.id}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("entry-models").upload(path, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });
    setUploading(null);
    if (error) {
      setErr(`Could not upload image: ${error.message}`);
      return;
    }
    const old = reviewRef.current[`${slot}_path` as const];
    if (old) supabase.storage.from("entry-models").remove([old]);
    update({ [`${slot}_path`]: path } as Partial<Review>);
  }

  async function removeSlot(slot: Slot) {
    const old = reviewRef.current[`${slot}_path` as const];
    if (old) supabase.storage.from("entry-models").remove([old]);
    update({ [`${slot}_path`]: null } as Partial<Review>);
  }

  async function deleteTrade() {
    if (!trade) return;
    const { error } = await supabase.from("trades").delete().eq("id", trade.id);
    if (error) {
      setErr(`Could not delete trade: ${error.message}`);
      return;
    }
    router.push("/journal");
  }

  function toggleFocus() {
    setFocus((f) => {
      localStorage.setItem("tb_journal_focus", f ? "0" : "1");
      return !f;
    });
  }

  const pos = dayIds.indexOf(tradeId);
  const prevId = pos > 0 ? dayIds[pos - 1] : null;
  const nextId = pos >= 0 && pos < dayIds.length - 1 ? dayIds[pos + 1] : null;

  const heading = useMemo(() => {
    if (!trade) return "";
    return new Date(trade.traded_on.length > 10 ? trade.traded_on : trade.traded_on + "T00:00:00").toLocaleDateString(
      undefined,
      { weekday: "short", day: "numeric", month: "short", year: "numeric" }
    );
  }, [trade]);

  const timeStr =
    trade && trade.traded_on.length > 10 && !/T00:00(:00)?/.test(trade.traded_on.slice(10, 19))
      ? trade.traded_on.slice(11, 16) + " UTC"
      : null;

  const session = useMemo(() => {
    if (!trade || !timeStr) return null;
    const at = new Date(trade.traded_on);
    return Number.isNaN(at.getTime()) ? null : sessionsAt(at);
  }, [trade, timeStr]);

  // Strategy dropdown: active plans, plus the snapshot name if that strategy
  // was deleted since (EdgeFlo's "Deleted Plans" group).
  const strategyDeleted =
    review.strategy_id != null && !strategies.some((s) => s.id === review.strategy_id);

  if (loading) {
    return <div className="px-6 py-10 text-sm text-muted">Loading trade…</div>;
  }
  if (!trade) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-danger">{err ?? "Trade not found."}</p>
        <Link href="/journal" className="mt-3 inline-block text-sm text-accent2 hover:underline">
          Back to journal
        </Link>
      </div>
    );
  }

  const emoRow = (
    list: { label: string; e: string }[],
    current: string | null,
    key: "entry_emotion" | "exit_emotion"
  ) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((x) => {
        const on = current === x.label;
        return (
          <button
            key={x.label}
            type="button"
            onClick={() => update({ [key]: on ? null : x.label } as Partial<Review>)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              on
                ? "border-accent bg-accent-soft text-foreground"
                : "border-border2 text-muted hover:border-accent hover:text-foreground"
            }`}
            aria-pressed={on}
          >
            <span aria-hidden="true">{x.e}</span> {x.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/journal"
          className="flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          Journal
        </Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <PairFlag pair={trade.pair} size={22} />
          <h1 className="truncate text-xl" style={{ fontFamily: "var(--font-display)" }}>
            {trade.pair ?? "Trade"}
          </h1>
          <span className="text-sm text-dim">
            {pos >= 0 && dayIds.length > 1 ? `Trade ${pos + 1} of ${dayIds.length} · ` : ""}
            {heading}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span aria-live="polite" className="mr-1 font-mono text-[11px] text-dim">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
          <button
            onClick={toggleFocus}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              focus
                ? "border-accent bg-accent-soft text-accent2"
                : "border-border2 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            {focus ? "Regular mode" : "Focus mode"}
          </button>
          <button
            onClick={() => prevId && router.push(`/journal/trade/${prevId}`)}
            disabled={!prevId}
            className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
          >
            ‹ Previous
          </button>
          <button
            onClick={() => nextId && router.push(`/journal/trade/${nextId}`)}
            disabled={!nextId}
            className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
          >
            Next trade ›
          </button>
        </div>
      </div>

      {err && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">{err}</p>
      )}
      {!reviewsAvailable && (
        <p className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
          The trade_reviews table isn&apos;t available yet (migration 0014), so this page can&apos;t save.
        </p>
      )}

      <div className={`grid gap-5 ${focus ? "" : "lg:grid-cols-[320px_1fr]"}`}>
        {/* trade facts */}
        {!focus && (
          <div className="h-fit rounded-2xl bg-card p-5 ring-1 ring-border">
            <div
              className={`text-2xl font-semibold ${trade.pnl != null && trade.pnl > 0 ? "text-success" : trade.pnl != null && trade.pnl < 0 ? "text-danger" : ""}`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {trade.pnl != null ? moneySigned(trade.pnl, cur) : "—"}
            </div>
            <div className="mb-4 text-[10px] uppercase tracking-widest text-dim">Net PnL</div>
            <KV k="Instrument" v={trade.pair ?? "—"} />
            <KV
              k="Direction"
              v={trade.direction === "long" ? "Long" : trade.direction === "short" ? "Short" : "—"}
              tone={trade.direction === "long" ? "up" : trade.direction === "short" ? "down" : undefined}
            />
            <KV k="Lot size" v={trade.size_lots != null ? String(trade.size_lots) : "—"} />
            <KV k="Date" v={heading} />
            {timeStr && <KV k="Time" v={timeStr} />}
            {session && <KV k="Session" v={session} />}
            <KV k="Entry" v={trade.entry_price != null ? String(trade.entry_price) : "—"} />
            <KV k="Stop" v={trade.stop_price != null ? String(trade.stop_price) : "—"} />
            <KV k="Exit" v={trade.exit_price != null ? String(trade.exit_price) : "—"} />
            <KV
              k="Return"
              v={trade.r_multiple != null ? `${trade.r_multiple}R` : "—"}
              tone={trade.r_multiple != null ? (trade.r_multiple >= 0 ? "up" : "down") : undefined}
            />
            <KV
              k="Commission + swap"
              v={trade.commission != null ? moneySigned(trade.commission, cur) : "—"}
            />
            {trade.notes && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="text-xs text-dim">Trade note</div>
                <p className="mt-1 text-sm text-muted">{trade.notes}</p>
              </div>
            )}
            <div className="mt-4 flex gap-2 border-t border-border pt-4">
              <button
                onClick={() => setEditOpen(true)}
                className="flex-1 rounded-lg border border-border2 px-3 py-2 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Edit trade
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-danger/40 px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger/10"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* charts + review */}
        <div className="space-y-5">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Charts</h2>
            <p className="mt-0.5 text-xs text-dim">Add screenshots to review context and execution.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {SLOTS.map((s) => {
                const url = imageUrls[s.key];
                const path = review[`${s.key}_path` as const];
                return (
                  <div key={s.key} className="relative">
                    {path && url ? (
                      <div className="group relative overflow-hidden rounded-xl border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`${s.label} chart screenshot`} className="h-36 w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent2">
                          {s.label}
                        </span>
                        <button
                          onClick={() => removeSlot(s.key)}
                          aria-label={`Remove ${s.label} screenshot`}
                          className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <label
                        className="flex h-36 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border2 text-xs text-dim transition hover:border-accent hover:text-accent2"
                        title={s.hint}
                      >
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent2">
                          {s.label}
                        </span>
                        {uploading === s.key ? (
                          "Uploading…"
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                            Upload image
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={!reviewsAvailable || uploading != null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadSlot(s.key, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Review &amp; reflection</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2.5 self-end pb-2">
                <input
                  type="checkbox"
                  checked={review.plan_followed === true}
                  onChange={(e) => update({ plan_followed: e.target.checked ? true : null })}
                  className="h-4 w-4 accent-[color:var(--accent)]"
                  disabled={!reviewsAvailable}
                />
                <span className="text-sm">I followed my trade plan</span>
              </label>
              <FieldWrap label="Which plan did you intend to follow?">
                <select
                  value={review.strategy_id ?? ""}
                  onChange={(e) => pickStrategy(e.target.value)}
                  className="jfield"
                  disabled={!reviewsAvailable}
                >
                  <option value="">None</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  {strategyDeleted && (
                    <option value={review.strategy_id!}>
                      {review.strategy_name ?? "Deleted plan"} (deleted)
                    </option>
                  )}
                </select>
              </FieldWrap>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FieldWrap label="Entry confluences">
                <TagInput
                  label="Entry confluences"
                  value={review.confluences}
                  onChange={(v) => update({ confluences: v })}
                  suggestions={catalog.confluences}
                  placeholder="LQ sweep, POI mitigation…"
                />
              </FieldWrap>
              <FieldWrap label="Trade management">
                <TagInput
                  label="Trade management"
                  value={review.management}
                  onChange={(v) => update({ management: v })}
                  suggestions={catalog.management}
                  placeholder="Partial at 1R, SL to BE…"
                />
              </FieldWrap>
            </div>

            <div className="mt-4">
              <FieldWrap label="Mistakes">
                <TagInput
                  label="Mistakes"
                  value={review.mistakes}
                  onChange={(v) => update({ mistakes: v })}
                  suggestions={catalog.mistakes}
                  placeholder="Impatience, entered too late…"
                  tone="danger"
                />
              </FieldWrap>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FieldWrap label="Entry emotion">
                {emoRow(ENTRY_EMOTIONS, review.entry_emotion, "entry_emotion")}
              </FieldWrap>
              <FieldWrap label="Exit emotion">
                {emoRow(EXIT_EMOTIONS, review.exit_emotion, "exit_emotion")}
              </FieldWrap>
            </div>

            <div className="mt-4">
              <FieldWrap label="Notes & reflection">
                <div className="relative">
                  <textarea
                    value={review.reflection ?? ""}
                    onChange={(e) => update({ reflection: e.target.value })}
                    placeholder="What went well? What will you do differently next time?"
                    rows={4}
                    disabled={!reviewsAvailable}
                    className="jfield w-full resize-y pr-11"
                  />
                  <div className="absolute bottom-2 right-2">
                    <MicButton
                      onText={(t) =>
                        update({ reflection: review.reflection ? `${review.reflection} ${t}` : t })
                      }
                      title="Dictate reflection"
                    />
                  </div>
                </div>
              </FieldWrap>
            </div>
          </div>
        </div>
      </div>

      {editOpen && (
        <TradeFormModal
          day={dayKey(trade.traded_on)}
          trade={trade}
          strategies={strategies}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Delete this trade?
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              The trade and its journal entry are removed permanently.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={deleteTrade}
                className="rounded-lg bg-danger/15 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/25"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-none">
      <span className="text-dim">{k}</span>
      <span
        className={`font-mono ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
      >
        {v}
      </span>
    </div>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-dim">{label}</div>
      {children}
    </div>
  );
}
