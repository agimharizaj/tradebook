import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /charts became /trading. Old links (including TradingView widget deep
// links with ?tvwidgetsymbol=) land here and carry their query along.
export default async function ChartsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(qs.size ? `/trading?${qs.toString()}` : "/trading");
}
