import type { Metadata } from "next";
import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import LogoMark from "@/components/LogoMark";
import PairFlag from "@/components/PairFlag";
import { moneySigned } from "@/lib/format";
import { emojiFor } from "@/lib/settings";

// Public, read-only view of one shared trade. Resolved by an unguessable
// token via the service-role key (server-side only); revoking the share
// deletes the row and 404s this page. Never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared trade — Tradebook",
  robots: { index: false, follow: false },
};

type Trade = {
  id: string;
  traded_on: string;
  pair: string | null;
  direction: string | null;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  size_lots: number | null;
  pnl: number | null;
  r_multiple: number | null;
};

type Review = {
  plan_followed: boolean | null;
  strategy_name: string | null;
  confluences: string[] | null;
  management: string[] | null;
  mistakes: string[] | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  reflection: string | null;
  htf_path: string | null;
  mtf_path: string | null;
  ltf_path: string | null;
};

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
      <LogoMark size={36} className="rounded-lg" />
      <p className="text-muted">This shared trade doesn&apos;t exist or the link was revoked.</p>
      <Link href="/" className="text-sm text-accent2 hover:underline">
        Tradebook
      </Link>
    </div>
  );
}

export default async function SharedTradePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !/^[0-9a-f-]{36}$/i.test(token)) return <NotFound />;

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: share } = await admin
    .from("trade_shares")
    .select("trade_id, user_id")
    .eq("token", token)
    .maybeSingle();
  if (!share) return <NotFound />;

  const [{ data: trade }, { data: review }, { data: owner }] = await Promise.all([
    admin.from("trades").select("*").eq("id", share.trade_id).maybeSingle(),
    admin.from("trade_reviews").select("*").eq("trade_id", share.trade_id).maybeSingle(),
    admin.auth.admin.getUserById(share.user_id),
  ]);
  if (!trade) return <NotFound />;

  const t = trade as Trade;
  const r = (review as Review | null) ?? null;
  const cur =
    (owner?.user?.user_metadata?.account_currency as string | undefined) || "USD";

  const charts: { label: string; url: string }[] = [];
  for (const [label, path] of [
    ["HTF", r?.htf_path],
    ["MTF", r?.mtf_path],
    ["LTF", r?.ltf_path],
  ] as const) {
    if (path) {
      const { data } = await admin.storage.from("entry-models").createSignedUrl(path, 3600);
      if (data?.signedUrl) charts.push({ label, url: data.signedUrl });
    }
  }

  const heading = new Date(
    t.traded_on.length > 10 ? t.traded_on : t.traded_on + "T00:00:00"
  ).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const emotions = [
    r?.entry_emotion ? `${emojiFor(r.entry_emotion) ?? ""} ${r.entry_emotion}` : null,
    r?.exit_emotion ? `${emojiFor(r.exit_emotion) ?? ""} ${r.exit_emotion}` : null,
  ].filter(Boolean);

  const tagRow = (label: string, tags: string[] | null | undefined, danger = false) =>
    tags && tags.length > 0 ? (
      <div>
        <div className="mb-1.5 text-xs text-dim">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((x) => (
            <span
              key={x}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                danger
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-accent/40 bg-accent-soft text-accent2"
              }`}
            >
              {x}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} className="rounded-lg" />
          <span className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Tradebook
          </span>
        </div>
        <span className="font-mono text-xs text-dim">shared trade · read-only</span>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 pb-16">
        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-3">
            <PairFlag pair={t.pair} size={24} />
            <h1 className="text-xl" style={{ fontFamily: "var(--font-display)" }}>
              {t.pair ?? "Trade"}
            </h1>
            <span
              className={`text-sm font-medium ${t.direction === "long" ? "text-success" : "text-danger"}`}
            >
              {t.direction === "long" ? "Long" : t.direction === "short" ? "Short" : ""}
            </span>
            <span className="text-sm text-dim">{heading}</span>
            {t.pnl != null && (
              <span
                className={`ml-auto font-mono text-xl font-semibold ${t.pnl > 0 ? "text-success" : t.pnl < 0 ? "text-danger" : ""}`}
              >
                {moneySigned(t.pnl, cur)}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Lots", t.size_lots != null ? String(t.size_lots) : "—"],
              ["Entry", t.entry_price != null ? String(t.entry_price) : "—"],
              ["Stop", t.stop_price != null ? String(t.stop_price) : "—"],
              ["Return", t.r_multiple != null ? `${t.r_multiple}R` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface2 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-dim">{k}</div>
                <div className="font-mono text-sm">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {charts.length > 0 && (
          <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Charts</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {charts.map((c) => (
                <div key={c.label} className="relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={`${c.label} chart`} className="h-40 w-full object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent2">
                    {c.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {r && (
          <div className="space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Review &amp; reflection
            </h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {r.plan_followed != null && (
                <span className={r.plan_followed ? "text-success" : "text-danger"}>
                  {r.plan_followed ? "Followed the trade plan" : "Did not follow the plan"}
                </span>
              )}
              {r.strategy_name && <span className="text-muted">Plan: {r.strategy_name}</span>}
              {emotions.length > 0 && (
                <span className="text-muted">Emotions: {emotions.join(" → ")}</span>
              )}
            </div>
            {tagRow("Entry confluences", r.confluences)}
            {tagRow("Trade management", r.management)}
            {tagRow("Mistakes", r.mistakes, true)}
            {r.reflection && (
              <div>
                <div className="mb-1.5 text-xs text-dim">Reflection</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {r.reflection}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
