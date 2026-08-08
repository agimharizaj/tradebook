import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

// Auth links that fail to exchange (expired confirmation/reset links, broken
// callbacks) land here with ?error=auth. Surface it instead of failing silently.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const initialError =
    sp.error === "auth"
      ? "That sign-in link didn't work - it may have expired or already been used. Log in below, or request a fresh link."
      : null;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthForm mode="login" initialError={initialError} />
    </main>
  );
}
