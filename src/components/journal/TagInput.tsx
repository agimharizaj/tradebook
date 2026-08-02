"use client";

// Chip-style multi tag input with autocomplete. Suggestions come from the
// user's own past tags (derived catalogs, no extra tables); Enter or click
// adds, including brand-new tags.
import { useMemo, useRef, useState } from "react";

export default function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  tone = "accent",
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  tone?: "accent" | "danger";
  label: string;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, value, input]);

  function add(tag: string) {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag));
  }

  const chip =
    tone === "danger"
      ? "border-danger/40 bg-danger/10 text-danger"
      : "border-accent/40 bg-accent-soft text-accent2";

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border2 bg-surface2 px-2.5 py-1.5 transition focus-within:border-accent"
        onClick={() => wrapRef.current?.querySelector("input")?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${chip}`}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(tag); }}
              aria-label={`Remove ${tag}`}
              className="opacity-70 transition hover:opacity-100"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input || options[0] || "");
            } else if (e.key === "Backspace" && !input && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={value.length ? "" : placeholder ?? "Add…"}
          aria-label={label}
          className="min-w-20 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-dim"
        />
      </div>
      {open && (options.length > 0 || input.trim()) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-border2 bg-card py-1 shadow-2xl">
          {options.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s); }}
              className="block w-full px-3 py-1.5 text-left text-sm text-muted transition hover:bg-surface2 hover:text-foreground"
            >
              {s}
            </button>
          ))}
          {/* New tags are first-class: typed text becomes a tag on click or
              Enter, and joins the suggestion catalog for every later trade. */}
          {input.trim() && !suggestions.includes(input.trim()) && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(input); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-accent2 transition hover:bg-surface2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
