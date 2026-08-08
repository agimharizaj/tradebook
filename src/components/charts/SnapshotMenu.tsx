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
  // The toolbar is an overflow-x-auto strip, which clips absolutely
  // positioned children - so the dropdown renders position:fixed, anchored
  // to the button's rect at open time.
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  function toggleOpen() {
    if (!canSnap) return;
    setOpen((o) => {
      if (!o && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
      }
      return !o;
    });
  }

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

  async function copyLink() {
    setOpen(false);
    const link = `${window.location.origin}/trading?tvwidgetsymbol=${encodeURIComponent(tv)}`;
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

  // Capture-and-hand-off destinations: SnapToNote (mounted on the page) and
  // the Sidekick dock both listen for these events.
  async function sendToNote() {
    setOpen(false);
    const blob = await capture();
    if (!blob) return;
    window.dispatchEvent(new CustomEvent("tb:snap-to-note", { detail: { blob } }));
  }

  async function askSidekick() {
    setOpen(false);
    const blob = await capture();
    if (!blob) return;
    window.dispatchEvent(new CustomEvent("tb:snap-to-sidekick", { detail: { blob } }));
  }

  // Capture-based items are dropped where the Screen Capture API is missing
  // (iOS Safari); the link items work everywhere.
  const items: { label: string; run: () => void; icon: string }[] = [
    ...(canSnap
      ? [
          { label: "Send to a note", run: sendToNote, icon: "M15.5 3.5a2.12 2.12 0 0 1 3 3L8 17l-4 1 1-4z" },
          { label: "Ask Sidekick about it", run: askSidekick, icon: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" },
          { label: "Download image", run: download, icon: "M12 3v12M7 10l5 5 5-5M4 21h16" },
          { label: "Copy image", run: () => void copyImage(), icon: "M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" },
        ]
      : []),
    { label: "Copy chart link", run: copyLink, icon: "M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" },
    ...(canSnap
      ? [{ label: "Post on X (copies image)", run: postOnX, icon: "M4 4l16 16M20 4L4 20" }]
      : []),
  ];

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        disabled={busy}
        title={canSnap ? "Chart snapshot" : "Chart links (capture isn't supported in this browser)"}
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

      {open && anchor && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            style={{ top: anchor.top, right: anchor.right }}
            className="fixed z-30 w-56 rounded-xl border border-border2 bg-card py-1 shadow-2xl"
          >
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

      {msg && anchor && (
        <div
          aria-live="polite"
          style={{ top: anchor.top, right: anchor.right }}
          className="fixed z-30 w-max max-w-64 rounded-lg border border-border2 bg-card px-3 py-1.5 text-xs text-muted shadow-xl"
        >
          {msg}
        </div>
      )}
    </div>
  );
}
