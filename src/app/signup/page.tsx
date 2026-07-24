import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthForm mode="signup" />
    </main>
  );
}
