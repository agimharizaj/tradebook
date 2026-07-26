"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidekickChat from "@/components/sidekick/SidekickChat";

type Strategy = { id: string; name: string };

// Floating Sidekick: available on every app page except /sidekick itself.
// The chat component is only mounted after the first open, so pages don't
// pay for it until it's used.
export default function SidekickDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/sidekick")) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask Sidekick"
          aria-label="Ask Sidekick"
          className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_8px_24px_rgba(106,88,240,0.45)] transition hover:brightness-110 md:bottom-6 md:right-6"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg2 shadow-2xl">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
              <span className="font-display text-[15px] font-semibold">Sidekick</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close Sidekick"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-foreground"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {strategies === null ? (
                <div className="flex h-full items-center justify-center text-sm text-dim">Loading…</div>
              ) : (
                <SidekickChat strategies={strategies} compact />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
