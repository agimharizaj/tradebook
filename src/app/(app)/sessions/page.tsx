import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The Sessions page merged into News (Aug 2026). Old links land on the
// Market sessions tab.
export default function SessionsRedirect() {
  redirect("/news?tab=sessions");
}
