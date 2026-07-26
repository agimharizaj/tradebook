"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LogoMark from "@/components/LogoMark";

type Mode = "login" | "signup";
type View = "form" | "forgot" | "forgot-sent";

/** Map raw Supabase auth errors to human wording. */
export function friendlyAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Wrong email or password. Try again or reset your password.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Log in instead.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password should be at least"))
    return "Password must be at least 10 characters.";
  if (m.includes("different from the old password"))
    return "New password must be different from your old one.";
  if (m.includes("unable to validate email") || m.includes("invalid format"))
    return "That email address does not look right. Check it and try again.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Could not reach the server. Check your connection and try again.";
  return raw;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
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
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState<View>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  const pwLongEnough = password.length >= 10;

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    resetFeedback();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`.trim(),
          },
        },
      });
      if (error) {
        setError(friendlyAuthError(error.message));
      } else if (data.session) {
        // Email confirmation is off: signed in immediately.
        router.push("/dashboard");
        router.refresh();
        return; // keep the button in its loading state during navigation
      } else {
        // Fallback: confirmation still enabled in Supabase.
        setMessage("Check your email to confirm your account, then log in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(friendlyAuthError(error.message));
      } else {
        router.push("/dashboard");
        router.refresh();
        return;
      }
    }
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    resetFeedback();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/reset`,
    });
    if (error) setError(friendlyAuthError(error.message));
    else setView("forgot-sent");
    setLoading(false);
  }

  const heading =
    view !== "form"
      ? "Reset your password"
      : mode === "login"
        ? "Welcome back"
        : "Create your account";

  const subheading =
    view === "forgot"
      ? "We will email you a link to set a new password"
      : view === "forgot-sent"
        ? ""
        : mode === "login"
          ? "Log in to your trading workspace"
          : "Start building your trading edge";

  return (
    <div className="w-full max-w-sm rounded-2xl bg-card p-8 ring-1 ring-border2">
      <div className="mb-6 text-center">
        <LogoMark size={44} className="mx-auto mb-3 rounded-xl shadow-[0_8px_24px_rgba(124,108,255,0.35)]" />
        <h1 className="text-xl">{heading}</h1>
        {subheading && <p className="mt-1 text-sm text-muted">{subheading}</p>}
      </div>

      {view === "forgot-sent" ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">
            If an account exists for <span className="font-medium">{email}</span>, a
            reset link is on its way. Open it on this device to set a new password.
          </p>
          <button
            type="button"
            onClick={() => {
              setView("form");
              resetFeedback();
            }}
            className="text-sm font-medium text-accent2 hover:underline"
          >
            Back to log in
          </button>
        </div>
      ) : view === "forgot" ? (
        <form onSubmit={handleForgot} className="space-y-4" noValidate={false}>
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Spinner />}
            {loading ? "Sending link..." : "Send reset link"}
          </button>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="text-center text-sm text-muted">
            Remembered it?{" "}
            <button
              type="button"
              onClick={() => {
                setView("form");
                resetFeedback();
              }}
              className="font-medium text-accent2 hover:underline"
            >
              Back to log in
            </button>
          </p>
        </form>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="flex gap-3">
                <div className="w-full">
                  <label htmlFor="auth-first" className="mb-1.5 block text-sm font-medium">
                    First name
                  </label>
                  <input
                    id="auth-first"
                    type="text"
                    required
                    autoFocus
                    autoComplete="given-name"
                    placeholder="Ada"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="field"
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="auth-last" className="mb-1.5 block text-sm font-medium">
                    Last name
                  </label>
                  <input
                    id="auth-last"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Lovelace"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="field"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoFocus={mode === "login"}
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="auth-password" className="block text-sm font-medium">
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setView("forgot");
                      resetFeedback();
                    }}
                    className="text-xs font-medium text-accent2 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={mode === "signup" ? 10 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 10 characters" : "Your password"}
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
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {mode === "signup" && (
                <p
                  className={`mt-1.5 text-xs ${pwLongEnough ? "text-success" : "text-muted"}`}
                  aria-live="polite"
                >
                  {pwLongEnough ? "✓ At least 10 characters" : "At least 10 characters"}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Spinner />}
              {loading
                ? mode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Log in"
                  : "Sign up"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}{" "}
              {error.includes("already exists") && (
                <Link href="/login" className="font-medium text-accent2 hover:underline">
                  Log in
                </Link>
              )}
            </p>
          )}
          {message && (
            <p className="mt-3 text-sm text-success" role="status">
              {message}
            </p>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link href="/signup" className="font-medium text-accent2 hover:underline">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-accent2 hover:underline">
                  Log in
                </Link>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
