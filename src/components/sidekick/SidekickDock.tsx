"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidekickChat from "@/components/sidekick/SidekickChat";

type Strategy = { id: string; name: string };

// Floating Sidekick: available on every app page except /sidekick itself.
// The chat component is only mounted after the first open, so pages don't
// pay for it until it's used.
const POS_KEY = "sk-dock-pos";
const BTN = 48; // launcher size (h-12 w-12)
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export default function SidekickDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  // A chart captured by "Snap to Sidekick" on the Charts page, waiting to be
  // attached once the chat mounts.
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  // Draggable launcher: null = default corner position (Tailwind classes);
  // set once the user drags it, anchored right/bottom and persisted.
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; right: number; bottom: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      // Corrupt value: fall back to the default corner.
    }
  }, []);

  // Keep a custom position inside the viewport when the window resizes.
  useEffect(() => {
    const onResize = () =>
      setPos((p) =>
        p
          ? {
              right: clamp(p.right, 8, window.innerWidth - BTN - 8),
              bottom: clamp(p.bottom, 8, window.innerHeight - BTN - 8),
            }
          : p
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onLauncherDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onLauncherMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Below ~6px it's a tap, not a drag.
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setPos({
      right: clamp(d.right - dx, 8, window.innerWidth - BTN - 8),
      bottom: clamp(d.bottom - dy, 8, window.innerHeight - BTN - 8),
    });
  }

  function onLauncherUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) {
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(p));
          } catch {
            // Storage full/blocked: position just won't persist.
          }
        }
        return p;
      });
    } else {
      setOpen(true);
    }
  }

  // "Snap to Sidekick" (Charts page) dispatches a chart blob; open the drawer
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
      {!open && (
        <button
          onPointerDown={onLauncherDown}
          onPointerMove={onLauncherMove}
          onPointerUp={onLauncherUp}
          title="Ask Sidekick (drag to move)"
          aria-label="Ask Sidekick"
          style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
          className="sk-dock-launcher fixed bottom-24 right-4 z-40 hidden h-12 w-12 cursor-grab touch-none items-center justify-center rounded-2xl bg-accent text-white shadow-[0_8px_24px_rgba(106,88,240,0.45)] hover:brightness-110 active:cursor-grabbing md:bottom-10 md:right-6 md:flex"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
          </svg>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={close} aria-hidden="true" />
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
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
