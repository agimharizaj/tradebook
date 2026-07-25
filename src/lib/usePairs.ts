"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PAIRS, PAIR_CATALOG } from "@/lib/pairs";

// The user's active watchlist (labels from PAIR_CATALOG), falling back to the
// defaults until their saved selection loads. Managed in Profile -> Pairs.
export function usePairs(): string[] {
  const [pairs, setPairs] = useState<string[]>(DEFAULT_PAIRS);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const p = data.user?.user_metadata?.pairs;
        if (Array.isArray(p)) {
          const valid = p.filter(
            (x): x is string => typeof x === "string" && PAIR_CATALOG.some((c) => c.label === x)
          );
          if (valid.length) setPairs(valid);
        }
      });
  }, []);
  return pairs;
}
