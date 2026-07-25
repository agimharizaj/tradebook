"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PAIRS, PAIR_CATALOG, PAIR_CATEGORIES } from "@/lib/pairs";

// The user's active pair watchlist. Lives in auth metadata `pairs` and drives
// every pair dropdown in the app. Each toggle saves immediately.
export default function PairsManager({ initial }: { initial: unknown }) {
  const supabase = createClient();
  const [pairs, setPairs] = useState<string[]>(() => {
    if (Array.isArray(initial)) {
      const valid = initial.filter(
        (x): x is string => typeof x === "string" && PAIR_CATALOG.some((c) => c.label === x)
      );
      if (valid.length) return valid;
    }
    return DEFAULT_PAIRS;
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function togglePair(label: string) {
    const next = pairs.includes(label)
      ? pairs.filter((x) => x !== label)
      : PAIR_CATALOG.filter((c) => [...pairs, label].includes(c.label)).map((c) => c.label);
    if (next.length === 0) {
      setMsg("Keep at least one pair.");
      return;
    }
    setPairs(next);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { pairs: next } });
    setMsg(error ? `Could not save: ${error.message}` : "Saved.");
  }

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <p className="mb-4 text-sm text-muted">
        Starred pairs appear in every pair dropdown across the app: charts,
        risk calculator, journal, analysis log, and note or strategy tags.
        Changes save automatically.
      </p>
      {msg && (
        <p className={`mb-4 text-xs ${msg === "Saved." ? "text-success" : "text-danger"}`}>{msg}</p>
      )}
      <div className="space-y-5">
        {PAIR_CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-dim">{cat}</div>
            <div className="flex flex-wrap gap-1.5">
              {PAIR_CATALOG.filter((c) => c.cat === cat).map((c) => {
                const on = pairs.includes(c.label);
                return (
                  <button
                    key={c.label}
                    onClick={() => togglePair(c.label)}
                    className={`rounded-full border px-3 py-1.5 font-mono text-xs transition ${
                      on
                        ? "border-accent bg-accent-soft text-accent2"
                        : "border-border2 text-muted hover:border-accent hover:text-foreground"
                    }`}
                  >
                    {on ? "★ " : "☆ "}{c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
