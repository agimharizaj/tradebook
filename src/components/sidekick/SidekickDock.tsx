"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidekickChat from "@/components/sidekick/SidekickChat";

type Strategy = { id: string; name: string };

// Sidekick entry point on every app page except /sidekick itself: a slim
// "Ask Sidekick" bar pinned bottom-centre (docs-assistant style, Cmd+I to
// focus). Typing a question and pressing Enter opens the right-hand panel
// with the question already sent; clicking the bar empty just opens the
// panel. The chat component is only mounted after the first open, so pages
// don't pay for it until it's used.
export default function SidekickDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [q, setQ] = useState("");
  // Captured chart / typed question waiting for the chat to mount.
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(true);
  // The bar can be tucked away into a small corner chip; remembered locally.
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iP(hone|ad|od)/.test(navigator.platform));
    setMinimized(localStorage.getItem("tb_sk_bar_min") === "1");
  }, []);

  function setMin(v: boolean) {
    setMinimized(v);
    localStorage.setItem("tb_sk_bar_min", v ? "1" : "0");
    if (!v) requestAnimationFrame(() => askRef.current?.focus());
  }

  function ask() {
    const text = q.trim();
    if (text) setPendingText(text);
    setQ("");
    setOpen(true);
  }

  // Cmd+I / Ctrl+I focuses the ask bar from anywhere (like the docs sites),
  // restoring it first if it was minimised.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (open) return;
        if (minimized) {
          setMinimized(false);
          localStorage.setItem("tb_sk_bar_min", "0");
          requestAnimationFrame(() => askRef.current?.focus());
        } else {
          askRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, minimized]);

  // "Snap to Sidekick" (Trading page) dispatches a chart blob; open the panel
  // and hold the image until the chat mounts and consumes it.
  useEffect(() => {
    const onSnap = (e: Event) => {
      const blob = (e as CustomEvent<{ blob?: Blob }>).detail?.blob;
      if (!blob) return;
      setPendingImage(blob);
      setOpen(true);
    };
    window.addEventListener("tb:snap-to-sidekick", onSnap);
    return () => window.removeEventListener("tb:snap-to-sidekick", onSnap);
  }, []);

  useEffect(() => {
    if (!open || strategies !== null) return;
    (async () => {
      const { data } = await createClient()
        .from("strategies")
        .select("id, name")
        .order("sort_order", { ascending: true });
      setStrategies((data as Strategy[]) ?? []);
    })();
  }, [open, strategies]);

  // Opening pushes a history entry so the phone's back button / gesture
  // closes the drawer instead of leaving the page. Closing via the UI pops
  // that entry so history stays clean.
  const close = useCallback(() => {
    if (window.history.state?.skDock) window.history.back();
    else setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, skDock: true }, "");
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (pathname.startsWith("/sidekick")) return null;

  return (
    <>
      {!open && minimized && (
        <button
          onClick={() => setMin(false)}
          title={`Ask Sidekick (${isMac ? "⌘I" : "Ctrl+I"})`}
          aria-label="Restore the Sidekick ask bar"
          className="sk-dock-launcher fixed bottom-6 right-6 z-40 hidden h-10 w-10 items-center justify-center rounded-full border border-border2 bg-card/95 text-accent2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur transition hover:border-accent md:flex"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
          </svg>
        </button>
      )}

      {!open && !minimized && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="sk-dock-launcher fixed bottom-6 left-1/2 z-40 hidden w-[26rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-2.5 rounded-full border border-border2 bg-card/95 py-2 pl-4 pr-2 shadow-[0_10px_34px_rgba(0,0,0,0.45)] backdrop-blur transition focus-within:border-accent md:flex"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent2" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
          </svg>
          <input
            ref={askRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask Sidekick anything…"
            aria-label="Ask Sidekick"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
          />
          <button
            type="button"
            onClick={() => setMin(true)}
            title="Minimise the ask bar"
            aria-label="Minimise the ask bar"
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full text-dim transition hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            type="submit"
            aria-label={q.trim() ? "Ask Sidekick" : "Open Sidekick"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-110"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:bg-transparent" onClick={close} aria-hidden="true" />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg2 pt-[env(safe-area-inset-top)] shadow-2xl">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-2 pr-2 md:pl-4">
              {/* Mobile: a proper back control with a generous touch target,
                  so leaving the drawer doesn't mean hunting for a small X. */}
              <button
                onClick={close}
                aria-label="Back"
                className="flex h-10 items-center gap-1 rounded-lg pl-1 pr-3 text-sm text-muted transition hover:bg-surface2 hover:text-foreground md:hidden"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </button>
              <span className="font-display text-[15px] font-semibold">Sidekick</span>
              <button
                onClick={close}
                aria-label="Close Sidekick"
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-foreground md:flex"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              {/* Spacer keeps the title centered on mobile */}
              <span className="w-16 md:hidden" aria-hidden="true" />
            </div>
            <div className="min-h-0 flex-1">
              {strategies === null ? (
                <div className="flex h-full items-center justify-center text-sm text-dim">Loading…</div>
              ) : (
                <SidekickChat
                  strategies={strategies}
                  compact
                  pendingImage={pendingImage}
                  onPendingImageUsed={() => setPendingImage(null)}
                  pendingText={pendingText}
                  onPendingTextUsed={() => setPendingText(null)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
