"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Strategy = { id: string; name: string };
type Convo = { id: string; title: string; updated_at: string };

type Msg = {
  role: "user" | "model";
  text: string;
  // Preview for the UI; the base64 payload is only sent for the newest
  // message, older ones become a text placeholder server-side.
  imageUrl?: string;
  image?: { mimeType: string; data: string };
  // Loaded from history: a screenshot was attached but its bytes aren't
  // stored, so render a chip instead of the image.
  hadImage?: boolean;
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

export default function SidekickChat({
  strategies,
  compact = false,
}: {
  strategies: Strategy[];
  // Compact: used inside the floating dock panel; history lives in a
  // dropdown instead of the side list.
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState<{ mimeType: string; data: string; previewUrl: string } | null>(null);
  const [strategyId, setStrategyId] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Double-send guard + cancelling an in-flight reply when switching chats.
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(
    async (id: string) => {
      // Switching away cancels any in-flight reply (its text so far is saved).
      console.info("[sidekick] switching to conversation", id);
      abortRef.current?.abort();
      // Unlock immediately; don't wait for the aborted request to unwind.
      busyRef.current = false;
      setBusy(false);
      setActiveId(id);
      setConfirmDeleteId(null);
      const { data, error } = await supabase
        .from("ai_messages")
        .select("role, content, strategy_name, has_image")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) console.warn("[sidekick] load messages failed:", error.message);
      setMessages(
        ((data as { role: "user" | "model"; content: string; strategy_name: string | null; has_image: boolean }[]) ?? []).map(
          (m) => ({
            role: m.role,
            text: m.content,
            hadImage: m.has_image,
            strategyName: m.strategy_name ?? undefined,
          })
        )
      );
    },
    [supabase]
  );

  // Load the conversation list once; auto-open the most recent chat.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      // If migration 0009 hasn't been applied yet the table is missing;
      // stay usable as a session-only chat.
      if (error || !data) return;
      setConvos(data as Convo[]);
      if (data.length) await loadConversation((data[0] as Convo).id);
    })();
  }, [supabase, loadConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function newChat() {
    abortRef.current?.abort();
    // Unlock immediately; don't wait for the aborted request to unwind.
    busyRef.current = false;
    setBusy(false);
    setActiveId(null);
    setMessages([]);
    setConfirmDeleteId(null);
    inputRef.current?.focus();
  }

  async function deleteConvo(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    setConvos((c) => c.filter((x) => x.id !== id));
    if (activeId === id) newChat();
    await supabase.from("ai_conversations").delete().eq("id", id); // messages cascade
  }

  // Persistence helpers: history saving must never break the chat itself.
  async function ensureConversation(firstText: string): Promise<string | null> {
    if (activeId) return activeId;
    const title = firstText.slice(0, 60) || "New chat";
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ title })
      .select("id, title, updated_at")
      .single();
    if (error || !data) {
      if (error) console.warn("[sidekick] create conversation failed:", error.message);
      return null;
    }
    const convo = data as Convo;
    setActiveId(convo.id);
    setConvos((c) => [convo, ...c]);
    return convo.id;
  }

  async function saveMessage(conversationId: string | null, m: Msg) {
    if (!conversationId) {
      console.warn("[sidekick] no conversation id, message not saved:", m.role);
      return;
    }
    const { error } = await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      role: m.role,
      content: m.text,
      strategy_name: m.strategyName ?? null,
      has_image: !!(m.image || m.hadImage),
    });
    if (error) console.warn(`[sidekick] save ${m.role} message failed:`, error.message);
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    setConvos((c) => {
      const hit = c.find((x) => x.id === conversationId);
      if (!hit) return c;
      return [{ ...hit, updated_at: new Date().toISOString() }, ...c.filter((x) => x.id !== conversationId)];
    });
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    // busyRef (not state) so two Enter presses in the same tick can't double-send.
    if ((!text && !attach) || busyRef.current) return;

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
    busyRef.current = true;

    // Persist the user message in the background (failures never block chat).
    const convoIdPromise = ensureConversation(userMsg.text)
      .then(async (id) => {
        await saveMessage(id, userMsg);
        return id;
      })
      .catch(() => null);

    const update = (text: string, error = false) =>
      setMessages((cur) => {
        // This reply was cancelled (user switched chats / started a new one):
        // never write its text into whatever thread is showing now.
        if (ac.signal.aborted) return cur;
        // Replace the streaming placeholder; if anything replaced the thread
        // meanwhile, append instead of overwriting someone else's message.
        const next = [...cur];
        const last = next[next.length - 1];
        if (last && last.role === "model") next[next.length - 1] = { role: "model", text, error };
        else next.push({ role: "model", text, error });
        return next;
      });

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          strategyId: sentStrategyId || null,
          messages: history.map((m, i) => ({
            role: m.role,
            // Only the message being sent now carries image bytes.
            text:
              (m.imageUrl || m.hadImage) && i < history.length - 1
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
      // Watchdog: if no chunk arrives for 45s, treat the reply as finished
      // rather than hanging in "writing" forever on a stuck connection.
      const readWithTimeout = () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const t = setTimeout(() => resolve({ done: true, value: undefined }), 45_000);
          reader.read().then(
            (r) => { clearTimeout(t); resolve(r); },
            (e) => { clearTimeout(t); reject(e); }
          );
        });
      for (;;) {
        const { done, value } = await readWithTimeout();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update(acc);
      }
      reader.cancel().catch(() => {});
      if (!acc.trim()) update("I didn't get a response back. Try again.", true);
    } catch {
      // Aborted = user switched chats; anything else is a real failure.
      if (!ac.signal.aborted && !acc.trim()) {
        update("Couldn't reach Sidekick. Check your connection and try again.", true);
      }
    } finally {
      // Persist whatever text arrived, even if cancelled or timed out.
      if (acc.trim()) {
        convoIdPromise.then((id) => saveMessage(id, { role: "model", text: acc })).catch(() => {});
      }
      // Only unlock if this request is still the active one; a newer send
      // owns the busy state now and must not be unlocked from here.
      if (abortRef.current === ac) {
        abortRef.current = null;
        setBusy(false);
        busyRef.current = false;
      }
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
    <div className="flex h-full">
      {/* history panel (desktop) */}
      <aside className={compact ? "hidden" : "hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex"}>
        <div className="p-3">
          <button
            onClick={newChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border2 bg-card px-3 py-2 text-sm font-medium transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent2"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New chat
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {convos.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-1 transition ${
                c.id === activeId ? "bg-accent-soft" : "hover:bg-surface2"
              }`}
            >
              <button
                onClick={() => loadConversation(c.id)}
                className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-[13px] ${
                  c.id === activeId ? "text-accent2" : "text-muted"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConvo(c.id)}
                aria-label={confirmDeleteId === c.id ? "Confirm delete" : `Delete "${c.title}"`}
                className={`shrink-0 rounded-md px-1.5 py-1 text-[11px] transition ${
                  confirmDeleteId === c.id
                    ? "bg-danger/15 text-danger"
                    : "text-dim opacity-0 hover:text-danger group-hover:opacity-100"
                }`}
              >
                {confirmDeleteId === c.id ? "Sure?" : "✕"}
              </button>
            </div>
          ))}
          {convos.length === 0 && <p className="px-3 py-2 text-xs text-dim">No saved chats yet.</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* history picker (mobile / compact dock) */}
        <div className={`flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 ${compact ? "" : "md:hidden"}`}>
          <select
            value={activeId ?? ""}
            onChange={(e) => (e.target.value ? loadConversation(e.target.value) : newChat())}
            className="input min-w-0 flex-1 text-sm"
            aria-label="Chat history"
          >
            <option value="">New chat</option>
            {convos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            onClick={newChat}
            aria-label="New chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border2 text-muted transition hover:bg-surface2 hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        {/* thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
            <div className="flex gap-3">
              <Avatar />
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">Sidekick · AI</div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                <p>
                  I read your journal, strategies and stats before every answer. Ask where
                  you&apos;re leaking money, which rules you broke, or whether a setup matches
                  your playbook.
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  For a setup check, attach a chart screenshot and pick a strategy. Each chat
                  keeps about the last 100k tokens in memory.
                </p>
                </div>
              </div>
            </div>

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="sk-in flex flex-row-reverse gap-3">
                  <div className="max-w-[85%] rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="Attached chart" className="mb-2 max-h-48 rounded-lg border border-border2" />
                    )}
                    {!m.imageUrl && m.hadImage && (
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border2 px-2.5 py-0.5 text-xs text-muted">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" /></svg>
                        chart screenshot
                      </div>
                    )}
                    {m.strategyName && (
                      <div className="mb-1.5 ml-1 inline-flex rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs text-accent2">
                        {m.strategyName}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className="sk-in flex gap-3">
                  <Avatar pulsing={busy && i === messages.length - 1} />
                  <div className="min-w-0 max-w-[85%]">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
                      Sidekick{busy && i === messages.length - 1 ? (m.text ? " · writing" : " · thinking") : " · AI"}
                    </div>
                    <div
                      className={`whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                        m.error
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : `border-border bg-card ${busy && i === messages.length - 1 ? "sk-bubble-live" : ""}`
                      }`}
                    >
                      {m.text || <TypingDots />}
                    </div>
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
    </div>
  );
}

function Avatar({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent shadow-[0_4px_14px_rgba(106,88,240,0.35)] ${
        pulsing ? "sk-avatar-live" : ""
      }`}
    >
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
