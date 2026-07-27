import MarketClocks from "@/components/sessions/MarketClocks";
import KillZones from "@/components/sessions/KillZones";

export const metadata = { title: "Sessions · Tradebook" };

export default function SessionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl">Sessions</h1>
      <p className="mt-1 text-sm text-muted">
        Market clocks, what&apos;s open right now, and a converter between the majors.
      </p>
      <div className="mt-6 space-y-6">
        <MarketClocks />
        <KillZones />
      </div>
    </div>
  );
}
