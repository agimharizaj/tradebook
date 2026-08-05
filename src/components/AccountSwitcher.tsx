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

  return (
    <select
      value={valid ? sel : ALL_ACCOUNTS}
      onChange={(e) => setSel(e.target.value)}
      aria-label="Account"
      title="Which account you're viewing and logging to"
      className={`shrink-0 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent ${className}`}
    >
      <option value={ALL_ACCOUNTS}>All accounts</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.status === "active" ? "" : a.status === "passed" ? "[passed] " : a.status === "failed" ? "[failed] " : "[closed] "}
          {a.name}
        </option>
      ))}
    </select>
  );
}
