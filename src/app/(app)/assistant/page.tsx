import { createClient } from "@/lib/supabase/server";
import AssistantChat from "@/components/assistant/AssistantChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("strategies")
    .select("id, name")
    .order("sort_order", { ascending: true });

  return <AssistantChat strategies={(data as { id: string; name: string }[]) ?? []} />;
}
