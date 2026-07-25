import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/BackLink";
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
      <BackLink fallback="/profile" />
      <h1 className="mt-2 text-2xl">Trading pairs</h1>
      <p className="mt-1 text-muted">Choose the instruments you trade.</p>
      <div className="mt-6">
        <PairsManager initial={user.user_metadata?.pairs} />
      </div>
    </div>
  );
}
