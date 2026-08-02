import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Trading pairs moved to Settings. Old links land in the right tab.
export default function PairsPage() {
  redirect("/settings?tab=pairs");
}
