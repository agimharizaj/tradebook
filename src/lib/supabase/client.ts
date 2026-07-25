import { createBrowserClient } from "@supabase/ssr";

// Keep the session cookie for a year and mark it persistent so iOS Safari and
// the installed PWA don't drop it on close.
const cookieOptions = {
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  path: "/",
  ...(process.env.NODE_ENV === "production" ? { secure: true } : {}),
};

// Supabase client for use in Client Components (runs in the browser).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions }
  );
}
