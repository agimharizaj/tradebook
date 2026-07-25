import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PairsManager from "@/components/PairsManager";

export const dynamic = "force-dynamic";

export default async function PairsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-10">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-accent2 hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Profile
      </Link>
      <h1 className="mt-2 text-2xl">Trading pairs</h1>
      <p className="mt-1 text-muted">Choose the instruments you trade.</p>
      <div className="mt-6">
        <PairsManager initial={user.user_metadata?.pairs} />
      </div>
    </div>
  );
}
