import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoMark from "@/components/LogoMark";
import HeroCurve from "@/components/landing/HeroCurve";
import RiskDemo from "@/components/landing/RiskDemo";
import EntryChecklist from "@/components/landing/EntryChecklist";
import JournalDemo from "@/components/landing/JournalDemo";
import SidekickDemo from "@/components/landing/SidekickDemo";

// Public landing page. Signed-in visitors skip straight to their dashboard.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const sp = await searchParams;

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

      {sp.deleted === "1" && (
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
            Your account and all its data have been permanently deleted.
          </p>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pb-24 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {["Playbooks", "Journal", "Risk", "Charts", "AI sidekick"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border2 px-2.5 py-1 font-mono text-xs text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1
              className="text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Plan the trade. Take the trade.
              <br />
              <span className="text-accent2">Face the numbers.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Tradebook is a trading companion built around your own rules.
              Playbooks you tick before entry, a journal that keeps score
              without flattering you, a risk engine that sizes the position
              before you click, and an AI sidekick that has read all of it.
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
              Installs on your phone. Your data stays in your own database.
            </p>
          </div>

          {/* Terminal card: animated equity curve + stat chips */}
          <div className="rounded-2xl border border-border bg-bg2 p-3 shadow-2xl">
            <div className="rounded-xl bg-card p-5 ring-1 ring-border">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Balance curve · demo
                </span>
                <span className="font-mono text-sm text-success">+12.4%</span>
              </div>
              <HeroCurve />
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
            <p className="px-2 pt-3 pb-1 font-mono text-xs text-dim">
              The dashboard draws this from your trades. These numbers are a demo.
            </p>
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
            Nine tools that usually live in nine tabs, wired together in one
            place and aware of each other.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: "Strategy playbooks",
                d: "Your setup as a tickable contract: charting process, entry and exit criteria, management rules, and hard risk caps per strategy. If the boxes aren't ticked, it's not your trade.",
              },
              {
                t: "Trade journal",
                d: "A calendar that keeps score: daily PnL, weekly and monthly breakdowns, true expectancy, and broker-history import so the record is complete even when you'd rather it wasn't.",
              },
              {
                t: "Risk engine",
                d: "Stop distance in, lot size out. Three modes, live prices, floored to broker steps. The math is done before the trade exists.",
              },
              {
                t: "Charts + analysis log",
                d: "TradingView charts with your watchlist and a screenshot log of every read you take, so you can check your past self's work.",
              },
              {
                t: "Notebook",
                d: "Block-based notes with images, timestamps and to-dos. Chart snaps file themselves into the right note.",
              },
              {
                t: "Dashboard analytics",
                d: "Equity curve, profit factor, drawdown, day-of-week leaks. Not a report card you buy, a mirror you own.",
              },
              {
                t: "Sidekick, the AI",
                d: "An assistant that reads your journal, strategies, notes and the page you're on before it answers. Chart reads, honest opinions, and rule-by-rule setup checks. Opinions with reasoning, never certainty.",
              },
              {
                t: "News + economic calendar",
                d: "Market headlines and the economic calendar next to your charts, archived as they arrive so the record deepens the longer you run it. Ask Sidekick what a print means for your pairs.",
              },
              {
                t: "Calm",
                d: "Box breathing and psychology prompts for the moments the market gets loud. The cheapest risk control in the whole app.",
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

      {/* Risk engine demo */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
              The sizing engine, live on this page.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              This is the actual sizing math from the app, running in your
              browser right now. Account size and risk in, lot size out, floored
              to 0.01 steps so a position never risks more than you stated.
            </p>
            <p className="mt-3 max-w-md leading-relaxed text-muted">
              Inside Tradebook the prices are live, the pairs come from your own
              watchlist, and there are two more modes: solve for the stop, or
              audit the risk of a size you already have on.
            </p>
          </div>
          <RiskDemo />
        </div>
      </section>

      {/* Journal calendar demo */}
      <section className="border-t border-border bg-bg2">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <JournalDemo />
            <div>
              <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                A month of trading at a glance.
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-muted">
                The journal is a calendar, exactly like this one. Green days,
                red days, tap any of them for the trades behind the number.
                Weekly and monthly summaries, true expectancy and average R
                sit underneath.
              </p>
              <p className="mt-3 max-w-md leading-relaxed text-muted">
                Log trades in seconds or import your broker history, commission
                and swap included, so the score is the real one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sidekick demo */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
              An analyst who has actually read your journal.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              Sidekick sits on every page. It knows your trades, your written
              rules, your notes and what&apos;s on screen, so you can ask it to
              read a chart, explain the news, or say plainly where the money
              leaks.
            </p>
            <p className="mt-3 max-w-md leading-relaxed text-muted">
              Attach a chart screenshot and it checks the setup against your
              own entry criteria, rule by rule. Opinions with reasoning, never
              certainty; the trade stays yours.
            </p>
          </div>
          <SidekickDemo />
        </div>
      </section>

      {/* Checklist strip */}
      <section className="border-t border-border bg-bg2">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <EntryChecklist />
            <div>
              <h2 className="text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                Your rules, in writing, next to the chart.
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-muted">
                Every strategy is a checklist you tick before entry. Try the one
                on the left: criteria strike through as they're met, exactly as
                they do in the app. Risk controls cap the damage on bad days, and
                the journal records what you actually did, not what you remember
                doing.
              </p>
              <p className="mt-3 max-w-md leading-relaxed text-muted">
                There is even a breathing page for the moments the market gets loud.
              </p>
            </div>
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
