import { createClient } from "@/lib/supabase/server";
import SidekickChat from "@/components/sidekick/SidekickChat";

export const dynamic = "force-dynamic";

export default async function SidekickPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("strategies")
    .select("id, name")
    .order("sort_order", { ascending: true });

  return <SidekickChat strategies={(data as { id: string; name: string }[]) ?? []} />;
}
