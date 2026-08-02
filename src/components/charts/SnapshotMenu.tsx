"use client";

// EdgeFlo-style chart snapshot menu: one camera button, a dropdown of
// destinations. Every image action goes through captureChartArea (the
// TradingView iframe is cross-origin, so the user-approved capture prompt is
// the only way to read its pixels - pick "This Tab" and it crops to the
// chart). "Copy chart link" needs no capture: it's a deep link that reopens
// this symbol here. "Post on X" can't attach an image via URL, so it copies
// the shot to the clipboard and opens the composer to paste into.
import { useEffect, useRef, useState } from "react";
import { captureChartArea } from "@/lib/captureChart";

export default function SnapshotMenu({
  current,
  tfLabel,
  tv,
  canSnap,
}: {
  current: string;
  tfLabel: string;
  tv: string;
  canSnap: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(text: string) {
    setMsg(text);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 3500);
  }
  useEffect(
    () => () => {
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    []
  );

  const filename = () => `chart-${current.replace(/\W/g, "")}-${tfLabel}-${Date.now()}.png`;

  async function capture(): Promise<Blob | null> {
    setBusy(true);
    const r = await captureChartArea();
    setBusy(false);
    if (!r.ok) {
      if (r.reason !== "cancelled") flash("Capture failed.");
      return null;
    }
    return r.blob;
  }

  async function download() {
    setOpen(false);
    const blob = await capture();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function copyImage(): Promise<boolean> {
    setOpen(false);
    const blob = await capture();
    if (!blob) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      flash("Image copied to clipboard.");
      return true;
    } catch {
      flash("Clipboard blocked - use Download instead.");
      return false;
    }
  }

  async function openTab() {
    setOpen(false);
    const blob = await capture();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function copyLink() {
    setOpen(false);
    const link = `${window.location.origin}/charts?tvwidgetsymbol=${encodeURIComponent(tv)}`;
    try {
      await navigator.clipboard.writeText(link);
      flash("Chart link copied - it reopens this pair here.");
    } catch {
      flash("Clipboard blocked.");
    }
  }

  async function postOnX() {
    const ok = await copyImage();
    const text = encodeURIComponent(`${current} ${tfLabel}`);
    window.open(`https://x.com/intent/post?text=${text}`, "_blank", "noopener");
    if (ok) flash("Image copied - paste it into the post.");
  }

  const items: { label: string; run: () => void; icon: string }[] = [
    { label: "Download image", run: download, icon: "M12 3v12M7 10l5 5 5-5M4 21h16" },
    { label: "Copy image", run: () => void copyImage(), icon: "M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" },
    { label: "Copy chart link", run: copyLink, icon: "M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" },
    { label: "Open in new tab", run: openTab, icon: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" },
    { label: "Post on X (copies image)", run: postOnX, icon: "M4 4l16 16M20 4L4 20" },
  ];

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => canSnap && setOpen((o) => !o)}
        disabled={busy || !canSnap}
        title={canSnap ? "Chart snapshot" : "Screen capture isn't supported in this browser"}
        aria-label="Chart snapshot menu"
        aria-expanded={open}
        className={`rounded-lg border px-3 py-2 transition disabled:opacity-50 ${
          open
            ? "border-accent bg-accent-soft text-accent2"
            : "border-border2 text-muted hover:border-accent hover:text-foreground"
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border2 bg-card py-1 shadow-2xl">
            <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
              Chart snapshot
            </div>
            {items.map((it) => (
              <button
                key={it.label}
                onClick={it.run}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted transition hover:bg-surface2 hover:text-foreground"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                  <path d={it.icon} />
                </svg>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}

      {msg && (
        <div
          aria-live="polite"
          className="absolute right-0 top-full z-30 mt-1.5 w-max max-w-64 rounded-lg border border-border2 bg-card px-3 py-1.5 text-xs text-muted shadow-xl"
        >
          {msg}
        </div>
      )}
    </div>
  );
}
