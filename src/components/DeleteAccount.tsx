"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Danger zone: permanent account deletion. Requires typing DELETE so a
// stray click can never do it. Everything goes: trades, strategies, notes,
// analyses, screenshots, and the login itself.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const armed = phrase.trim() === "DELETE";

  async function run() {
    if (!armed || busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "Could not delete the account. Try again.");
      setBusy(false);
      return;
    }
    // The auth user is gone; clear the local session and land on the
    // public page.
    await createClient().auth.signOut().catch(() => {});
    window.location.href = "/?deleted=1";
  }

  return (
    <div className="rounded-2xl border border-danger/30 bg-card p-6">
      <div className="text-xs font-medium uppercase tracking-wide text-danger">Danger zone</div>
      <p className="mt-2 text-sm text-muted">
        Deleting your account permanently removes everything: trades, strategies,
        notes, analyses, screenshots, and your login. There is no undo and no
        grace period.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-danger/50 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          Delete account
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-dim">
              Type <span className="font-mono font-medium text-danger">DELETE</span> to confirm
            </span>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="field max-w-xs font-mono"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setOpen(false); setPhrase(""); setErr(null); }}
              className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={run}
              disabled={!armed || busy}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Deleting..." : "Permanently delete my account"}
            </button>
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      )}
    </div>
  );
}
