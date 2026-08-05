"use client";

// Global account context switcher: "All accounts" or one specific account.
// Selection persists per device and broadcasts tb:account-changed so every
// mounted page rescopes. Renders nothing until accounts exist (single-account
// users never see it). Native <option> can't render SVG, so status is shown
// with a text prefix there (tolerated exception).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_ACCOUNTS,
  fetchAccounts,
  useSelectedAccount,
  type Account,
} from "@/lib/accounts";

export default function AccountSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [sel, setSel] = useSelectedAccount();

  useEffect(() => {
    fetchAccounts(createClient()).then(({ accounts: a }) => setAccounts(a));
  }, []);

  // Exactly one visible account: a chooser with one real choice is noise
  // (and "All" would quietly include hidden accounts' trades). Lock the
  // scope to it and render nothing; the switcher returns when a second
  // visible account exists.
  const unhidden = (accounts ?? []).filter((a) => !a.hidden);
  const soleId = unhidden.length === 1 ? unhidden[0].id : null;
  useEffect(() => {
    if (soleId && sel !== soleId) setSel(soleId);
  }, [soleId, sel, setSel]);

  if (!accounts || accounts.length === 0) return null;
  if (soleId) return null;

  // Hidden accounts stay out of the everyday list entirely (unhide them in
  // Settings > Accounts) - unless one is the current selection.
  const visible = accounts.filter((a) => !a.hidden || a.id === sel);
  // A stale selection (deleted account) falls back to all.
  const valid = sel === ALL_ACCOUNTS || visible.some((a) => a.id === sel);
  const active = visible.filter((a) => a.status === "active");
  const ended = visible.filter((a) => a.status !== "active");

  return (
    <select
      value={valid ? sel : ALL_ACCOUNTS}
      onChange={(e) => {
        if (e.target.value === "__manage") {
          router.push("/settings?tab=accounts");
          return;
        }
        setSel(e.target.value);
      }}
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
      {/* Discoverability bridge: hide/unhide, lifecycle and creation all
          live in Settings > Accounts. */}
      <option value="__manage">Manage accounts…</option>
    </select>
  );
}
