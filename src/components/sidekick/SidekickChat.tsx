"use client";

import { useEffect, useRef, useState } from "react";

type Strategy = { id: string; name: string };

type Msg = {
  role: "user" | "model";
  text: string;
  // Preview for the UI; the base64 payload is only sent for the newest
  // message, older ones become a text placeholder server-side.
  imageUrl?: string;
  image?: { mimeType: string; data: string };
  strategyName?: string;
  error?: boolean;
};

const SUGGESTIONS = [
  "Am I breaking my risk rules?",
  "How is my expectancy trending?",
  "Where am I leaking money?",
  "Review my last 10 trades",
];

// Downscale to keep the request small and inside Gemini's inline-data limits.
async function fileToImage(file: File): Promise<{ mimeType: string; data: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.split(",")[1], previewUrl: dataUrl };
}

export default function SidekickChat({ strategies }: { strategies: Strategy[] }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState<{ mimeType: string; data: string; previewUrl: string } | null>(null);
  const [strategyId, setStrategyId] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if ((!text && !attach) || busy) return;

    const userMsg: Msg = {
      role: "user",
      text: text || "Check this setup against my rules.",
      ...(attach
        ? {
            imageUrl: attach.previewUrl,
            image: { mimeType: attach.mimeType, data: attach.data },
            strategyName: strategies.find((s) => s.id === strategyId)?.name,
          }
        : {}),
    };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "model", text: "" }]);
    setInput("");
    const sentStrategyId = attach ? strategyId : "";
    setAttach(null);
    setBusy(true);

    const update = (text: string, error = false) =>
      setMessages((cur) => {
        const next = [...cur];
        next[next.length - 1] = { role: "model", text, error };
        return next;
      });

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: sentStrategyId || null,
          messages: history.map((m, i) => ({
            role: m.role,
            // Only the message being sent now carries image bytes.
            text:
              m.imageUrl && i < history.length - 1
                ? `(a chart screenshot was attached here${m.strategyName ? `, checked against "${m.strategyName}"` : ""}) ${m.text}`
                : m.strategyName && i === history.length - 1
                  ? `(setup check against strategy "${m.strategyName}") ${m.text}`
                  : m.text,
            ...(i === history.length - 1 && m.image ? { image: m.image } : {}),
          })),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        update(j?.error ?? `Something went wrong (${res.status}).`, true);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update(acc);
      }
      if (!acc.trim()) update("I didn't get a response back. Try again.", true);
    } catch {
      update("Couldn't reach Sidekick. Check your connection and try again.", true);
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setAttach(await fileToImage(file));
    inputRef.current?.focus();
  }

  function autogrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }

  return (
    <div className="flex h-full flex-col">
      {/* thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
          <div className="flex gap-3">
            <Avatar />
            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
              <p>
                I&apos;m your trading analyst. I can see your journal, strategies and stats, and I&apos;ll
                hold you to your own rules. I analyse; I never signal.
              </p>
              <p className="mt-2 text-[13px] text-muted">
                Ask about your patterns, or attach a chart screenshot and pick a strategy for a
                rule-compliance check.
              </p>
            </div>
          </div>

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex flex-row-reverse gap-3">
                <div className="max-w-[85%] rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="Attached chart" className="mb-2 max-h-48 rounded-lg border border-border2" />
                  )}
                  {m.strategyName && (
                    <div className="mb-1.5 inline-flex rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs text-accent2">
                      {m.strategyName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <Avatar />
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                    m.error ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-card"
                  }`}
                >
                  {m.text || <TypingDots />}
                </div>
              </div>
            )
          )}

          {messages.length === 0 && (
            <div className="ml-10 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border2 bg-card px-3.5 py-1.5 text-[13px] text-muted transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent2"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-border bg-bg2 px-4 pb-3 pt-3 md:px-6">
        <div className="mx-auto max-w-3xl">
          {attach && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attach.previewUrl} alt="Chart to check" className="h-11 w-16 rounded-lg border border-border2 object-cover" />
                <button
                  onClick={() => setAttach(null)}
                  aria-label="Remove attachment"
                  className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="input w-auto text-sm"
                aria-label="Strategy to check against"
              >
                <option value="">Check against strategy…</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-dim">Rules compliance only, never a trade call.</span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-border2 bg-card p-1.5 transition focus-within:border-accent/60">
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach chart screenshot"
              aria-label="Attach chart screenshot"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autogrow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about your trading…"
              className="max-h-[140px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-dim"
            />
            <button
              onClick={() => send()}
              disabled={busy || (!input.trim() && !attach)}
              title="Send"
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_6px_16px_rgba(106,88,240,0.35)] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-dim">
            Analysis of your own data, not financial advice or signals.
          </p>
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent shadow-[0_4px_14px_rgba(106,88,240,0.35)]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1.5 py-1" aria-label="Sidekick is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-dim"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}
