"use client";

import { useState } from "react";
import { captureChartArea } from "@/lib/captureChart";

// Toolbar button on the charts page: capture the chart and hand it to the
// Sidekick drawer (via a window event the dock listens for) so the AI can read
// it. Desktop only, like the other capture controls (getDisplayMedia).
export default function SnapToSidekick() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  }

  async function snap() {
    setBusy(true);
    const r = await captureChartArea();
    setBusy(false);
    if (!r.ok) {
      if (r.reason === "unsupported") flash("Screen capture is not supported in this browser.");
      else if (r.reason === "failed") flash("Could not read the captured frame.");
      return; // cancelled: stay silent
    }
    window.dispatchEvent(new CustomEvent("tb:snap-to-sidekick", { detail: { blob: r.blob } }));
  }

  return (
    <>
      <button
        onClick={snap}
        disabled={busy}
        title="Capture the chart and ask Sidekick"
        className="shrink-0 whitespace-nowrap rounded-lg border border-border2 px-3 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
      >
        {busy ? "Capturing..." : "Snap to Sidekick"}
      </button>

      {msg && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border2 bg-card px-4 py-2.5 text-sm text-muted shadow-xl md:bottom-6">
          {msg}
        </div>
      )}
    </>
  );
}
