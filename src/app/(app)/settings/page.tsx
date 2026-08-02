import { createClient } from "@/lib/supabase/server";
import SettingsWorkspace from "@/components/settings/SettingsWorkspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <SettingsWorkspace meta={user?.user_metadata ?? {}} />;
}
