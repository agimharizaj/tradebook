"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "img" blocks hold a storage path in `text` (entry-models bucket) and are
// created by "Send to Notebook" on a chart analysis, not from the palette.
type BlockType = "text" | "h" | "todo" | "bullet" | "number" | "sticky" | "date" | "img";
// w: image width as a percent of the note column (Notion-style resize).
type Block = { id: string; type: BlockType; text: string; checked?: boolean; color?: string; w?: number };

const STICKY_COLORS: { key: string; c: string }[] = [
  { key: "gold", c: "var(--gold)" },
  { key: "violet", c: "var(--accent)" },
  { key: "teal", c: "var(--success)" },
  { key: "red", c: "var(--danger)" },
  { key: "blue", c: "#3b82f6" },
];
// Resolves a private-bucket path to a fresh signed URL on render, so the
// stored note never contains an expiring link.
function StorageImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // External URL: use it as-is. Otherwise it's a storage path to sign.
    if (/^https?:\/\//.test(path)) {
      setUrl(path);
      return;
    }
    let live = true;
    createClient()
      .storage.from("entry-models")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (live) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      live = false;
    };
  }, [path]);
  if (!url) return <span className="w-full py-2 text-xs text-dim">Loading screenshot...</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Note image" className="my-1 h-auto w-full min-w-0 rounded-lg border border-border" />;
}

function stickyStyle(color?: string) {
  const c = STICKY_COLORS.find((s) => s.key === color)?.c ?? "var(--gold)";
  return {
    borderColor: `color-mix(in srgb, ${c} 40%, transparent)`,
    background: `color-mix(in srgb, ${c} 12%, transparent)`,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);

function parse(content: string): Block[] {
  try {
    const j = JSON.parse(content);
    if (j && Array.isArray(j.blocks) && j.blocks.length) return j.blocks;
  } catch {
    // legacy plain-text note
  }
  return [{ id: uid(), type: "text", text: content ?? "" }];
}
const serialize = (blocks: Block[]) => JSON.stringify({ blocks });

// Read-only rendering of a note: no textareas, drag handles or delete
// buttons. To-dos stay tickable (written through onChange), matching how
// the strategy view keeps its checklists live.
export function NoteView({ content, onChange }: { content: string; onChange: (c: string) => void }) {
  const blocks = parse(content);
  let num = 0;
  const toggle = (id: string) =>
    onChange(serialize(blocks.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b))));
  return (
    <div className="space-y-2">
      {blocks.map((b) => {
        const n = b.type === "number" ? ++num : (num = 0);
        if (b.type === "img")
          return (
            <div key={b.id} style={{ width: `${b.w ?? 100}%` }}>
              <StorageImage path={b.text} />
            </div>
          );
        if (b.type === "date") {
          const d = new Date(`${b.text}T00:00:00`);
          return (
            <p key={b.id} className="font-mono text-sm text-muted">
              {Number.isNaN(d.getTime()) ? b.text : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          );
        }
        if (b.type === "todo") {
          return (
            <button key={b.id} onClick={() => toggle(b.id)} className="flex w-full items-start gap-2.5 text-left text-[15px]">
              <span
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  b.checked ? "border-success bg-success text-background" : "border-border2 hover:border-accent"
                }`}
              >
                {b.checked && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
              <span className={`whitespace-pre-wrap ${b.checked ? "text-muted line-through" : ""}`}>{b.text}</span>
            </button>
          );
        }
        if (!b.text.trim()) return <div key={b.id} className="h-4" />;
        if (b.type === "h") {
          return (
            <h2 key={b.id} className="pt-2 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {b.text}
            </h2>
          );
        }
        if (b.type === "sticky") {
          return (
            <div key={b.id} className="whitespace-pre-wrap rounded-lg border p-3 text-[15px] leading-relaxed" style={stickyStyle(b.color)}>
              {b.text}
            </div>
          );
        }
        if (b.type === "bullet") {
          return (
            <p key={b.id} className="flex gap-2 text-[15px] leading-relaxed">
              <span className="text-muted">•</span>
              <span className="whitespace-pre-wrap">{b.text}</span>
            </p>
          );
        }
        if (b.type === "number") {
          return (
            <p key={b.id} className="flex gap-2 text-[15px] leading-relaxed">
              <span className="font-mono text-sm leading-6 text-muted">{n}.</span>
              <span className="whitespace-pre-wrap">{b.text}</span>
            </p>
          );
        }
        return (
          <p key={b.id} className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

const ADD: { type: BlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "h", label: "Heading" },
  { type: "todo", label: "To-do" },
  { type: "bullet", label: "Bullet" },
  { type: "number", label: "Numbered" },
  { type: "sticky", label: "Sticky" },
  { type: "date", label: "Date" },
];

export default function BlockEditor({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (content: string) => void;
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => parse(initial));
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const focusId = useRef<string | null>(null);
  const lastFocus = useRef<string | null>(null);
  const first = useRef(true);
  const [dragId, setDragId] = useState<string | null>(null);

  // Add-block palette: docked under the note by default; the user can pop it
  // out into a draggable floating pill. Mode and position remembered locally.
  const palRef = useRef<HTMLDivElement>(null);
  const palOffset = useRef({ x: 0, y: 0 });
  const [palFloating, setPalFloating] = useState(false);
  const [palPos, setPalPos] = useState<{ x: number; y: number } | null>(null);
  const [palDragging, setPalDragging] = useState(false);

  useEffect(() => {
    try {
      setPalFloating(localStorage.getItem("tb-note-palette-float") === "1");
      const s = localStorage.getItem("tb-note-palette");
      if (s) {
        const p = JSON.parse(s);
        if (typeof p?.x === "number" && typeof p?.y === "number") setPalPos(p);
      }
    } catch {
      // ignore bad stored state
    }
  }, []);

  function setFloating(f: boolean) {
    setPalFloating(f);
    try {
      localStorage.setItem("tb-note-palette-float", f ? "1" : "0");
    } catch {
      // fine, just won't persist
    }
  }

  useEffect(() => {
    if (!palDragging) return;
    const onMove = (e: PointerEvent) => {
      const el = palRef.current;
      if (!el) return;
      const x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, e.clientX - palOffset.current.x));
      const y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, e.clientY - palOffset.current.y));
      setPalPos({ x, y });
    };
    const onUp = () => {
      setPalDragging(false);
      setPalPos((p) => {
        if (p) {
          try {
            localStorage.setItem("tb-note-palette", JSON.stringify(p));
          } catch {
            // storage full/blocked: position just won't persist
          }
        }
        return p;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [palDragging]);

  // "+ Analysis" in the palette: pick a saved chart analysis and insert its
  // blocks (heading, bias, notes, screenshot) into this note.
  type AnalysisRow = {
    id: string;
    symbol: string;
    timeframe: string | null;
    direction: string | null;
    notes: string | null;
    image_path: string | null;
    created_at: string;
  };
  const [showAnalyses, setShowAnalyses] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);

  async function openAnalyses() {
    const { data } = await createClient()
      .from("chart_analyses")
      .select("id, symbol, timeframe, direction, notes, image_path, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setAnalyses((data as AnalysisRow[]) ?? []);
    setShowAnalyses(true);
  }

  function insertAnalysis(a: AnalysisRow) {
    snapshot();
    const add: Block[] = [
      { id: uid(), type: "h", text: `${a.symbol}${a.timeframe ? ` ${a.timeframe}` : ""} analysis` },
    ];
    if (a.direction) add.push({ id: uid(), type: "text", text: `Bias: ${a.direction}` });
    if (a.notes) add.push({ id: uid(), type: "text", text: a.notes });
    if (a.image_path) add.push({ id: uid(), type: "img", text: a.image_path });
    setBlocks((bs) => [...bs, ...add]);
    setShowAnalyses(false);
  }

  // Curated emoji strip: inserts at the cursor of the last-focused block,
  // or appends a text block when nothing is focused. The OS emoji keyboard
  // works in every field too; this is the one-click path while journaling.
  // "+ Image": upload from the device (photo library / camera on mobile,
  // file picker on desktop) into the entry-models bucket, or embed by URL.
  // Both become img blocks; StorageImage renders either form.
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setImgBusy(true);
    setImgErr(null);
    const c = createClient();
    const { data: u } = await c.auth.getUser();
    if (!u.user) {
      setImgErr("Not signed in.");
      setImgBusy(false);
      return;
    }
    const name = file.name || "pasted.png";
    const path = `${u.user.id}/note-${uid()}-${name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await c.storage.from("entry-models").upload(path, file);
    setImgBusy(false);
    if (error) {
      setImgErr(`Upload failed: ${error.message}`);
      return;
    }
    snapshot();
    setBlocks((bs) => [...bs, { id: uid(), type: "img", text: path }]);
  }

  function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  // Notion-style image resize: drag the right-edge handle; width is stored
  // on the block as a percent of the note column. One undo step per drag.
  function startImgResize(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const wrap = (e.currentTarget as HTMLElement).parentElement;
    const parent = wrap?.parentElement;
    if (!wrap || !parent) return;
    const startPx = wrap.getBoundingClientRect().width;
    const parentPx = parent.getBoundingClientRect().width;
    const startX = e.clientX;
    snapshot();
    const onMove = (ev: PointerEvent) => {
      const pct = Math.round(Math.min(100, Math.max(20, ((startPx + ev.clientX - startX) / parentPx) * 100)));
      setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, w: pct } : b)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // Pasting a screenshot anywhere in the note (long-press paste on mobile,
  // Cmd+V on desktop) uploads it and appends an image block.
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    uploadFile(file);
  }

  const EMOJIS = ["✅","❌","⚠️","🔥","📈","📉","💰","🎯","🧠","😤","😌","🚀","🐂","🐻","💡","⭐","❗","⏰","📌","👀","💪","🤝"];
  const [showEmoji, setShowEmoji] = useState(false);

  function insertText(txt: string) {
    const id = lastFocus.current;
    const el = id ? refs.current[id] : null;
    if (id && el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + txt + el.value.slice(end);
      update(id, { text: next });
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + txt.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      const nb: Block = { id: uid(), type: "text", text: txt };
      focusId.current = nb.id;
      setBlocks((bs) => [...bs, nb]);
    }
  }
  const insertEmoji = (em: string) => insertText(em);

  // "+ Now": stamps the current date and time at the cursor (or as a new
  // line) so progress updates can be logged as they happen.
  function insertNow() {
    const d = new Date();
    const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    insertText(`${day} ${time} - `);
  }

  function startPalDrag(e: React.PointerEvent) {
    const el = palRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    palOffset.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setPalPos({ x: r.left, y: r.top });
    setPalDragging(true);
  }

  useEffect(() => {
    // Skip the initial mount so merely opening a note doesn't trigger a save.
    if (first.current) {
      first.current = false;
      return;
    }
    onChange(serialize(blocks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  useEffect(() => {
    if (focusId.current) {
      const el = refs.current[focusId.current];
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      focusId.current = null;
    }
  });

  // ---- Undo/redo (Cmd+Z / Cmd+Shift+Z) ----
  // Whole-list snapshots taken before every mutation. Typing within a
  // second collapses into one undo step; structural changes (add, delete,
  // reorder, insert) always get their own step. The browser's native
  // per-textarea undo is overridden so history covers block operations too.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const past = useRef<Block[][]>([]);
  const future = useRef<Block[][]>([]);
  const lastSnap = useRef(0);

  function snapshot(groupTyping = false) {
    const now = Date.now();
    if (groupTyping && now - lastSnap.current < 1000 && past.current.length) return;
    past.current.push(blocksRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    lastSnap.current = now;
  }
  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(blocksRef.current);
    focusId.current = null;
    setBlocks(prev);
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(blocksRef.current);
    focusId.current = null;
    setBlocks(next);
  }
  function onHistoryKeys(e: React.KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  function update(id: string, patch: Partial<Block>) {
    snapshot(true);
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addAfter(id: string, type: BlockType) {
    snapshot();
    const nb: Block = { id: uid(), type, text: "", checked: false };
    focusId.current = nb.id;
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const next = [...bs];
      next.splice(i + 1, 0, nb);
      return next;
    });
  }
  function append(type: BlockType) {
    snapshot();
    const nb: Block = { id: uid(), type, text: "", checked: false };
    focusId.current = nb.id;
    setBlocks((bs) => [...bs, nb]);
  }
  function remove(id: string, focusPrev = false) {
    snapshot();
    setBlocks((bs) => {
      if (bs.length === 1) return [{ id: uid(), type: "text", text: "" }];
      const i = bs.findIndex((b) => b.id === id);
      if (focusPrev && i > 0) focusId.current = bs[i - 1].id;
      return bs.filter((b) => b.id !== id);
    });
  }
  function move(from: string, to: string) {
    snapshot();
    setBlocks((bs) => {
      const fi = bs.findIndex((b) => b.id === from);
      const ti = bs.findIndex((b) => b.id === to);
      if (fi < 0 || ti < 0 || fi === ti) return bs;
      const next = [...bs];
      const [m] = next.splice(fi, 1);
      next.splice(ti, 0, m);
      return next;
    });
  }
  // Touch fallback: HTML5 drag never fires on iOS.
  function moveBy(id: string, delta: -1 | 1) {
    snapshot();
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      const [m] = next.splice(i, 1);
      next.splice(j, 0, m);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const contType = b.type === "h" || b.type === "sticky" ? "text" : b.type;
      addAfter(b.id, contType);
    } else if (e.key === "Backspace" && b.text === "") {
      e.preventDefault();
      remove(b.id, true);
    }
  }

  function grow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  let numCount = 0;

  return (
    <div className="space-y-1" onKeyDown={onHistoryKeys} onPaste={onPaste}>
      {blocks.map((b) => {
        const num = b.type === "number" ? ++numCount : (numCount = 0);
        const isSticky = b.type === "sticky";
        return (
          <div
            key={b.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) move(dragId, b.id);
              setDragId(null);
            }}
            className={`group flex items-start gap-1 rounded-lg ${isSticky ? "border p-2" : ""}`}
            style={isSticky ? stickyStyle(b.color) : undefined}
          >
            {/* Desktop: hover drag handle. Touch: visible up/down buttons. */}
            <span
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragEnd={() => setDragId(null)}
              className="mt-1.5 hidden cursor-grab select-none px-0.5 text-dim opacity-0 transition group-hover:opacity-100 md:inline"
              aria-label="Drag to reorder"
            >
              ⋮⋮
            </span>
            <span className="flex shrink-0 flex-col md:hidden">
              <button
                onClick={() => moveBy(b.id, -1)}
                className="px-1.5 py-0.5 text-dim"
                aria-label="Move block up"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <button
                onClick={() => moveBy(b.id, 1)}
                className="px-1.5 py-0.5 text-dim"
                aria-label="Move block down"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </span>

            {b.type === "todo" && (
              <input
                type="checkbox"
                checked={!!b.checked}
                onChange={() => update(b.id, { checked: !b.checked })}
                className="mt-2 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
            )}
            {b.type === "bullet" && <span className="mt-1.5 shrink-0 text-muted">•</span>}
            {b.type === "number" && (
              <span className="mt-1.5 shrink-0 font-mono text-sm text-muted">{num}.</span>
            )}

            {b.type === "img" ? (
              <span className="relative block min-w-0" style={{ width: `${b.w ?? 100}%` }}>
                <StorageImage path={b.text} />
                <span
                  onPointerDown={(e) => startImgResize(e, b.id)}
                  className="absolute -right-1 top-1/2 h-10 w-2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/50 ring-1 ring-background/60 md:opacity-0 md:transition md:group-hover:opacity-100"
                  role="separator"
                  aria-label="Drag to resize image"
                />
              </span>
            ) : b.type === "date" ? (
              <input
                type="date"
                value={b.text}
                onChange={(e) => update(b.id, { text: e.target.value })}
                className="mt-0.5 rounded-md border border-border2 bg-surface2 px-2 py-1 text-sm text-foreground outline-none"
              />
            ) : (
              <textarea
                ref={(el) => {
                  refs.current[b.id] = el;
                  grow(el);
                }}
                rows={1}
                value={b.text}
                onChange={(e) => {
                  update(b.id, { text: e.target.value });
                  grow(e.target);
                }}
                onKeyDown={(e) => onKeyDown(e, b)}
                onFocus={() => { lastFocus.current = b.id; }}
                placeholder={b.type === "h" ? "Heading" : isSticky ? "Sticky note" : "Type here..."}
                className={`w-full resize-none border-none bg-transparent outline-none placeholder:text-dim ${
                  b.type === "h"
                    ? "text-xl font-semibold"
                    : b.type === "todo" && b.checked
                      ? "text-muted line-through"
                      : "text-[15px]"
                } leading-relaxed`}
                style={b.type === "h" ? { fontFamily: "var(--font-display)" } : undefined}
              />
            )}

            {isSticky && (
              <div className="mt-1.5 flex shrink-0 gap-1.5 transition md:gap-1 md:opacity-0 md:group-hover:opacity-100">
                {STICKY_COLORS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => update(b.id, { color: s.key })}
                    title={s.key}
                    aria-label={`Sticky ${s.key}`}
                    className={`h-5 w-5 rounded-full border md:h-3.5 md:w-3.5 ${(b.color ?? "gold") === s.key ? "border-foreground" : "border-border2"}`}
                    style={{ background: s.c }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => remove(b.id)}
              className="mt-0.5 rounded-md p-1.5 text-sm text-dim transition hover:text-danger md:opacity-0 md:group-hover:opacity-100"
              aria-label="Delete block"
            >
              ✕
            </button>
          </div>
        );
      })}

      {showAnalyses && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setShowAnalyses(false)}
        >
          <div
            className="max-h-[70dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
                Insert analysis
              </h3>
              <button
                onClick={() => setShowAnalyses(false)}
                className="rounded-md p-2 text-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {analyses.length === 0 ? (
              <p className="text-sm text-dim">
                No saved analyses yet. Save one from Charts, then insert it here.
              </p>
            ) : (
              <div className="space-y-1">
                {analyses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => insertAnalysis(a)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-left transition hover:border-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.symbol}</span>
                      {a.timeframe && <span className="shrink-0 text-xs text-dim">{a.timeframe}</span>}
                      {a.direction && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${a.direction === "long" ? "bg-success/15 text-success" : a.direction === "short" ? "bg-danger/15 text-danger" : "bg-surface2 text-muted"}`}>
                          {a.direction}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-dim">
                      {new Date(a.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {imgErr && <p className="text-xs text-danger">{imgErr}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadImage} />

      {showEmoji && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border2 bg-surface2/60 p-2">
          {EMOJIS.map((em) => (
            <button
              key={em}
              // preventDefault keeps the focused textarea focused so the
              // emoji lands at the cursor.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insertEmoji(em)}
              className="rounded-md p-1.5 text-lg transition hover:bg-surface2"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {palFloating ? (
        /* Floating palette: drag anywhere by the ⋮⋮ handle, dock to put it back. */
        <div
          ref={palRef}
          style={palPos ? { left: palPos.x, top: palPos.y, right: "auto", bottom: "auto" } : undefined}
          className="fixed bottom-24 right-3 z-40 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-2xl border border-border2 bg-card/95 px-2 py-1.5 shadow-xl backdrop-blur md:bottom-6"
        >
          <span
            onPointerDown={startPalDrag}
            className="cursor-move touch-none select-none px-1.5 py-1 text-dim"
            aria-label="Drag palette"
            title="Drag to move"
          >
            ⋮⋮
          </span>
          {ADD.map((a) => (
            <button
              key={a.type}
              onClick={() => append(a.type)}
              className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              + {a.label}
            </button>
          ))}
          <button
            onClick={insertNow}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            title="Insert the current date and time"
          >
            + Now
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={imgBusy}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            {imgBusy ? "Uploading..." : "+ Image"}
          </button>
          <button
            onClick={openAnalyses}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            + Analysis
          </button>
          <button
            onClick={() => setShowEmoji((v) => !v)}
            aria-pressed={showEmoji}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition ${showEmoji ? "border-accent bg-accent-soft" : "border-border2 text-muted hover:border-accent"}`}
            title="Insert emoji"
          >
            😀
          </button>
          <button
            onClick={() => setFloating(false)}
            className="ml-1 rounded-md px-2 py-1.5 text-xs text-dim transition hover:text-foreground"
            title="Dock the palette back under the note"
          >
            Dock
          </button>
        </div>
      ) : (
        /* Docked palette (default): the original row under the note. */
        <div className="flex flex-wrap items-center gap-1.5 pt-3">
          {ADD.map((a) => (
            <button
              key={a.type}
              onClick={() => append(a.type)}
              className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              + {a.label}
            </button>
          ))}
          <button
            onClick={insertNow}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            title="Insert the current date and time"
          >
            + Now
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={imgBusy}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            {imgBusy ? "Uploading..." : "+ Image"}
          </button>
          <button
            onClick={openAnalyses}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            + Analysis
          </button>
          <button
            onClick={() => setShowEmoji((v) => !v)}
            aria-pressed={showEmoji}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition ${showEmoji ? "border-accent bg-accent-soft" : "border-border2 text-muted hover:border-accent"}`}
            title="Insert emoji"
          >
            😀
          </button>
          <button
            onClick={() => setFloating(true)}
            className="rounded-md px-2 py-1.5 text-xs text-dim transition hover:text-foreground"
            title="Float this palette so you can drag it anywhere"
          >
            Float
          </button>
        </div>
      )}
    </div>
  );
}
