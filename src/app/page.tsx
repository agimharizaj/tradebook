import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoMark from "@/components/LogoMark";

// Public landing page. Signed-in visitors skip straight to their dashboard.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} className="rounded-lg" />
          <span className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Tradebook
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Sign up
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pb-24 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full border border-border2 px-3 py-1 font-mono text-xs text-muted">
              Playbooks · Journal · Risk · Charts
            </p>
            <h1
              className="text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Your entire trading edge.
              <br />
              <span className="text-accent2">One terminal.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Strategy playbooks you actually follow, a journal that shows you the
              truth, and a risk engine that sizes every position before you click.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(106,88,240,0.35)] transition hover:opacity-90"
              >
                Create your account
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-border2 px-6 py-3 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Log in
              </Link>
            </div>
            <p className="mt-4 font-mono text-xs text-dim">
              Works in the browser. Installs on your phone.
            </p>
          </div>

          {/* Terminal mock: equity curve + stat chips */}
          <div className="rounded-2xl border border-border bg-bg2 p-3 shadow-2xl">
            <div className="rounded-xl bg-card p-5 ring-1 ring-border">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Balance curve
                </span>
                <span className="font-mono text-sm text-success">+12.4%</span>
              </div>
              <svg viewBox="0 0 400 120" className="w-full" aria-hidden="true">
                <path
                  d="M0,95 L30,88 L55,98 L80,70 L105,78 L130,52 L155,60 L180,45 L205,58 L230,38 L255,45 L280,30 L305,36 L330,22 L360,28 L400,10"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M0,95 L30,88 L55,98 L80,70 L105,78 L130,52 L155,60 L180,45 L205,58 L230,38 L255,45 L280,30 L305,36 L330,22 L360,28 L400,10 L400,120 L0,120 Z"
                  fill="var(--success)"
                  opacity="0.1"
                />
                <line x1="0" x2="400" y1="95" y2="95" stroke="var(--border2)" strokeDasharray="4 4" />
              </svg>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ["Win rate", "61.3%", ""],
                  ["Profit factor", "1.84", ""],
                  ["Max DD", "-3.2%", "down"],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-lg bg-surface2 p-2.5">
                    <div className="text-[10px] text-dim">{label}</div>
                    <div
                      className={`font-mono text-sm font-medium ${tone === "down" ? "text-danger" : "text-success"}`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-border">
              <span className="font-mono text-xs text-muted">RISK · EUR/USD</span>
              <span className="font-mono text-xs text-dim">0.5% risk =</span>
              <span className="font-mono text-sm font-medium text-accent2">0.42 lots</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-bg2">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            Everything between the idea and the fill.
          </h2>
          <p className="mt-2 max-w-xl text-muted">
            Six tools that usually live in six tabs, wired together in one place.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: "Strategy playbooks",
                d: "Charting process, entry and exit criteria as tickable checklists, trade management rules, and hard risk controls per strategy.",
              },
              {
                t: "Trade journal",
                d: "Monthly calendar with daily PnL, weekly and monthly breakdowns, true expectancy, and one-click MT5 / FTMO CSV import.",
              },
              {
                t: "Risk engine",
                d: "Three sizing modes with live prices. Account risk in, lot size out, floored to broker steps. No more napkin math.",
              },
              {
                t: "Charts + analysis log",
                d: "TradingView charts with your watchlist, an on-chart risk widget, and a screenshot log of every read you take.",
              },
              {
                t: "Notebook",
                d: "Block-based notes with images, timestamps, to-dos and stickies. Chart snaps file themselves into the right note.",
              },
              {
                t: "Dashboard analytics",
                d: "Balance curve, daily PnL, PnL by pair, day-of-week leaks, streaks and drawdown. Your edge, quantified.",
              },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl bg-card p-6 ring-1 ring-border transition hover:ring-accent">
                <h3 className="font-medium" style={{ fontFamily: "var(--font-display)" }}>
                  {f.t}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discipline strip */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
              Entry criteria · London sweep
            </div>
            {[
              ["Liquidity taken above Asia high", true],
              ["15m structure shift confirmed", true],
              ["Entry inside FVG, risk 0.5%", false],
            ].map(([text, done]) => (
              <div key={text as string} className="flex items-center gap-2.5 py-1.5 text-sm">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${done ? "border-success bg-success text-background" : "border-border2"}`}
                >
                  {done ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  ) : null}
                </span>
                <span className={done ? "text-muted line-through" : ""}>{text}</span>
              </div>
            ))}
            <div className="mt-3 rounded-lg bg-surface2 px-3 py-2 font-mono text-xs text-dim">
              Max daily loss -1% · Window 07:00-11:00 London
            </div>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
              Built for discipline, not dopamine.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              Your rules live next to your chart. Criteria get ticked before entries,
              risk controls cap the damage on bad days, and the journal shows you
              what you actually did - not what you remember doing.
            </p>
            <p className="mt-3 max-w-md leading-relaxed text-muted">
              There is even a breathing page for the moments the market gets loud.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-bg2">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center md:px-8">
          <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            Trade your plan. Prove it.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Set up your first playbook and log your next trade in minutes.
          </p>
          <Link
            href="/signup"
            className="mt-7 inline-block rounded-lg bg-accent px-8 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(106,88,240,0.35)] transition hover:opacity-90"
          >
            Create your account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 md:px-8">
          <div className="flex items-center gap-2">
            <LogoMark size={22} className="rounded-md" />
            <span className="text-sm text-muted">Tradebook</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-dim">
            <Link href="/login" className="transition hover:text-foreground">Log in</Link>
            <Link href="/signup" className="transition hover:text-foreground">Sign up</Link>
            <span className="font-mono text-xs">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
