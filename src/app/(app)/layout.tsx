import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import LogoMark from "@/components/LogoMark";

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
    // Viewport units misbehave in iOS standalone PWAs (dvh under-measures,
    // vh over-measures). globals.css pins html/body to the exact visible
    // area in standalone, so the shell inherits that via h-full there.
    <div className="flex h-dvh overflow-hidden [@media(display-mode:standalone)]:h-full">
      <Sidebar email={user.email ?? ""} name={displayName} />
      <div className="flex flex-1 flex-col overflow-hidden">
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
        <main className="flex-1 overflow-y-auto bg-bg2">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
