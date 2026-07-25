"use client";

import { useEffect, useRef, useState } from "react";

type BlockType = "text" | "h" | "todo" | "bullet" | "number" | "sticky" | "date";
type Block = { id: string; type: BlockType; text: string; checked?: boolean; color?: string };

const STICKY_COLORS: { key: string; c: string }[] = [
  { key: "gold", c: "var(--gold)" },
  { key: "violet", c: "var(--accent)" },
  { key: "teal", c: "var(--success)" },
  { key: "red", c: "var(--danger)" },
  { key: "blue", c: "#3b82f6" },
];
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
            <span
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragEnd={() => setDragId(null)}
              className="mt-1.5 cursor-grab select-none px-0.5 text-dim opacity-0 transition group-hover:opacity-100"
              aria-label="Drag to reorder"
            >
              ⋮⋮
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

            {b.type === "date" ? (
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
              <div className="mt-1.5 flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                {STICKY_COLORS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => update(b.id, { color: s.key })}
                    title={s.key}
                    aria-label={`Sticky ${s.key}`}
                    className={`h-3.5 w-3.5 rounded-full border ${(b.color ?? "gold") === s.key ? "border-foreground" : "border-border2"}`}
                    style={{ background: s.c }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => remove(b.id)}
              className="mt-1 px-1 text-sm text-dim opacity-0 transition hover:text-danger group-hover:opacity-100"
              aria-label="Delete block"
            >
              ✕
            </button>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1.5 pt-3">
        {ADD.map((a) => (
          <button
            key={a.type}
            onClick={() => append(a.type)}
            className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            + {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
