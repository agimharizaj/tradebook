"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LogoMark from "@/components/LogoMark";
import { friendlyAuthError } from "@/components/AuthForm";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user);
      setChecking(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pwLongEnough = password.length >= 10;
  const pwsMatch = password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pwLongEnough) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (!pwsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 ring-1 ring-border2">
        <div className="mb-6 text-center">
          <LogoMark size={44} className="mx-auto mb-3 rounded-xl shadow-[0_8px_24px_rgba(124,108,255,0.35)]" />
          <h1 className="text-xl">Set a new password</h1>
          {hasSession && (
            <p className="mt-1 text-sm text-muted">
              Choose a new password for your account
            </p>
          )}
        </div>

        {checking ? (
          <p className="text-center text-sm text-muted">Checking your link...</p>
        ) : !hasSession ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">
              This reset link has expired or was already used. Request a new one
              from the log in page.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium">
                New password
              </label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={10}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition hover:text-foreground"
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  )}
                </button>
              </div>
              <p
                className={`mt-1.5 text-xs ${pwLongEnough ? "text-success" : "text-muted"}`}
                aria-live="polite"
              >
                {pwLongEnough ? "✓ At least 10 characters" : "At least 10 characters"}
              </p>
            </div>

            <div>
              <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium">
                Confirm new password
              </label>
              <input
                id="reset-confirm"
                type={showPw ? "text" : "password"}
                required
                minLength={10}
                autoComplete="new-password"
                placeholder="Repeat the password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="field"
              />
              {confirm.length > 0 && !pwsMatch && (
                <p className="mt-1.5 text-xs text-danger" aria-live="polite">
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {loading ? "Saving..." : "Save new password"}
            </button>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
