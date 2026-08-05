"use client";

// Global account context switcher: "All accounts" or one specific account.
// Selection persists per device and broadcasts tb:account-changed so every
// mounted page rescopes. Renders nothing until accounts exist (single-account
// users never see it). Native <option> can't render SVG, so status is shown
// with a text prefix there (tolerated exception).
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_ACCOUNTS,
  fetchAccounts,
  useSelectedAccount,
  type Account,
} from "@/lib/accounts";

export default function AccountSwitcher({ className = "" }: { className?: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [sel, setSel] = useSelectedAccount();

  useEffect(() => {
    fetchAccounts(createClient()).then(({ accounts: a }) => setAccounts(a));
  }, []);

  if (!accounts || accounts.length === 0) return null;

  // A stale selection (deleted account) falls back to all.
  const valid = sel === ALL_ACCOUNTS || accounts.some((a) => a.id === sel);
  const active = accounts.filter((a) => a.status === "active");
  const ended = accounts.filter((a) => a.status !== "active");

  return (
    <select
      value={valid ? sel : ALL_ACCOUNTS}
      onChange={(e) => setSel(e.target.value)}
      aria-label="Account"
      title="Which account you're viewing and logging to"
      className={`shrink-0 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent ${className}`}
    >
      <option value={ALL_ACCOUNTS}>All accounts</option>
      {active.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
      {/* Ended accounts stay reachable (their journals matter) but tucked
          under a group instead of cluttering the everyday list. */}
      {ended.length > 0 && (
        <optgroup label="Ended">
          {ended.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.status})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
