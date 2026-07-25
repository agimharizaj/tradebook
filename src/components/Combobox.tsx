"use client";

import { useState } from "react";

export default function Combobox({
  value,
  options,
  onSelect,
  onType,
  placeholder,
}: {
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  onType?: (value: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  return (
    <div className="relative">
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onType?.(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="field"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border2 bg-card shadow-lg">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                setQuery(o);
                setOpen(false);
                onSelect(o);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-foreground transition hover:bg-surface2"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
