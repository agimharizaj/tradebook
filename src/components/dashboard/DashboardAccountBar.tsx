"use client";

// The dashboard is server-rendered, so the account selection has to reach it
// through the URL: this wraps the global AccountSwitcher and mirrors the
// device-wide selection into ?account=, triggering a server refetch.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AccountSwitcher from "@/components/AccountSwitcher";
import { ALL_ACCOUNTS, useSelectedAccount } from "@/lib/accounts";

export default function DashboardAccountBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [sel] = useSelectedAccount();
  const urlSel = params.get("account") ?? ALL_ACCOUNTS;

  useEffect(() => {
    if (sel !== urlSel) {
      router.replace(sel === ALL_ACCOUNTS ? "/dashboard" : `/dashboard?account=${sel}`);
    }
  }, [sel, urlSel, router]);

  return <AccountSwitcher />;
}
