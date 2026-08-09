import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import LogoMark from "@/components/LogoMark";
import SidekickDock from "@/components/sidekick/SidekickDock";
import TutorialTour from "@/components/TutorialTour";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";

  return (
    // Every CSS viewport unit measures wrong somewhere in iOS standalone
    // PWAs. --app-height is set from window.innerHeight (the real usable
    // height) by the boot script in the root layout.
    <div className="flex h-dvh overflow-hidden [@media(display-mode:standalone)]:h-[var(--app-height,100vh)]">
      <Sidebar email={user.email ?? ""} name={displayName} />
      {/* relative: the Sidekick launcher positions against this column, so it
          stays centred on the CONTENT area as the sidebar is dragged/collapsed. */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Browser tabs get the logo header for orientation. The installed
            PWA hides it (nav lives in the tab bar) and keeps only a spacer
            so content clears the iPhone status bar / Dynamic Island. */}
        <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] md:hidden [@media(display-mode:standalone)]:hidden">
          <LogoMark size={26} className="rounded-md" />
          <span className="font-display text-base font-semibold">Tradebook</span>
        </header>
        <div
          aria-hidden="true"
          className="hidden shrink-0 bg-background pt-[env(safe-area-inset-top)] md:!hidden [@media(display-mode:standalone)]:block"
        />
        {/* Mobile bottom padding clears the fixed tab bar. */}
        <main className="flex-1 overflow-y-auto bg-bg2 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <MobileNav />
        <SidekickDock />
        <TutorialTour />
      </div>
    </div>
  );
}
