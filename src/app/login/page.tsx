import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthForm mode="login" />
    </main>
  );
}
