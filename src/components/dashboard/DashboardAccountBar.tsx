"use client";

// The dashboard is server-rendered, so the account selection has to reach it
// through the URL: this wraps the global AccountSwitcher and keeps ?account=
// and the device-wide selection in step BOTH ways. Whichever side changed
// last wins: a card click / deep link updates the URL, so the selection
// adopts it (before this, the stored selection instantly rewrote the URL and
// clicking a card "opened for a second then snapped back"); changing the
// dropdown updates the selection, so the URL follows.
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AccountSwitcher from "@/components/AccountSwitcher";
import { ALL_ACCOUNTS, useSelectedAccount } from "@/lib/accounts";

export default function DashboardAccountBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [sel, setSel] = useSelectedAccount();
  const urlSel = params.get("account") ?? ALL_ACCOUNTS;
  const prevUrl = useRef(urlSel);
  const prevSel = useRef(sel);

  useEffect(() => {
    const urlChanged = urlSel !== prevUrl.current;
    const selChanged = sel !== prevSel.current;
    prevUrl.current = urlSel;
    prevSel.current = sel;
    if (sel === urlSel) return;
    if (urlChanged && !selChanged) {
      setSel(urlSel);
    } else {
      // Covers dropdown changes AND first mount (arriving with a stale or
      // missing ?account=): the stored selection scopes the page.
      router.replace(sel === ALL_ACCOUNTS ? "/dashboard" : `/dashboard?account=${sel}`);
    }
  }, [sel, urlSel, router, setSel]);

  return <AccountSwitcher />;
}
