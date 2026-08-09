import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The Sessions page merged into News (Aug 2026). Old links land here and get
// carried to the Market sessions section; the hash survives the redirect.
export default function SessionsRedirect() {
  redirect("/news#sessions");
}
