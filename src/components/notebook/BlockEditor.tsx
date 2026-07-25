"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "img" blocks hold a storage path in `text` (entry-models bucket) and are
// created by "Send to Notebook" on a chart analysis, not from the palette.
type BlockType = "text" | "h" | "todo" | "bullet" | "number" | "sticky" | "date" | "img";
type Block = { id: string; type: BlockType; text: string; checked?: boolean; color?: string };

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
  return <img src={url} alt="Chart screenshot" className="my-1 w-full max-w-xl rounded-lg border border-border" />;
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

  function update(id: string, patch: Partial<Block>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addAfter(id: string, type: BlockType) {
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
    const nb: Block = { id: uid(), type, text: "", checked: false };
    focusId.current = nb.id;
    setBlocks((bs) => [...bs, nb]);
  }
  function remove(id: string, focusPrev = false) {
    setBlocks((bs) => {
      if (bs.length === 1) return [{ id: uid(), type: "text", text: "" }];
      const i = bs.findIndex((b) => b.id === id);
      if (focusPrev && i > 0) focusId.current = bs[i - 1].id;
      return bs.filter((b) => b.id !== id);
    });
  }
  function move(from: string, to: string) {
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
    <div className="space-y-1">
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
              <StorageImage path={b.text} />
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
