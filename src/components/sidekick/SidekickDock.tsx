"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidekickChat from "@/components/sidekick/SidekickChat";

type Strategy = { id: string; name: string };

// Sidekick entry point on every app page except /sidekick itself: a small
// sparkle pill pinned bottom-centre that expands into the full ask bar on
// hover or focus (Cmd/Ctrl+I from anywhere). The bar has: attach an image,
// the question input ("/" jumps into the panel composer with the slash menu),
// open-the-panel, and send. Submitting opens the right-hand panel with the
// question already sent. The chat component only mounts after the first
// open, so pages don't pay for it until it's used.
export default function SidekickDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [q, setQ] = useState("");
  // Hover/focus expansion of the pill.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = hovered || focused || q.length > 0;
  // Work waiting for the chat to mount: an image, a question, or a draft.
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function ask() {
    const text = q.trim();
    if (text) setPendingText(text);
    setQ("");
    setOpen(true);
  }

  // "/" hands over to the panel composer, where the real slash menu lives.
  function onType(v: string) {
    if (v.startsWith("/")) {
      setPendingDraft(v);
      setQ("");
      setOpen(true);
      return;
    }
    setQ(v);
  }

  function onAttach(file: File | null) {
    if (!file) return;
    setPendingImage(file);
    setOpen(true);
  }

  // Cmd+I / Ctrl+I expands and focuses the ask bar from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (open) return;
        setHovered(true);
        requestAnimationFrame(() => askRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-foreground";

  return (
    <>
      {!open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`sk-dock-launcher fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 items-center overflow-hidden rounded-full border border-border2 bg-card/95 shadow-[0_10px_34px_rgba(0,0,0,0.45)] backdrop-blur transition-all duration-300 ease-out focus-within:border-accent md:flex ${
            expanded ? "w-[26rem] max-w-[calc(100vw-3rem)] gap-1.5 py-1.5 pl-2 pr-1.5" : "w-16 justify-center py-2"
          }`}
        >
          <span
            className={`flex shrink-0 items-center justify-center text-accent2 ${expanded ? "h-8 w-8" : ""}`}
            aria-hidden="true"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
            </svg>
          </span>

          {expanded && (
            <>
              {/* attach an image (opens the panel with it) */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach a chart image"
                aria-label="Attach a chart image"
                className={iconBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onAttach(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />

              <input
                ref={askRef}
                value={q}
                onChange={(e) => onType(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Ask Sidekick, or / for commands…"
                aria-label="Ask Sidekick"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
              />

              {/* open the side panel without asking anything */}
              <button
                type="button"
                onClick={() => setOpen(true)}
                title="Open the Sidekick panel"
                aria-label="Open the Sidekick panel"
                className={iconBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M15 4v16" />
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
            </>
          )}
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
                  pendingDraft={pendingDraft}
                  onPendingDraftUsed={() => setPendingDraft(null)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
