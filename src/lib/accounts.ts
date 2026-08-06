"use client";

// Prop-firm accounts (migration 0019): fetch helpers, the client-side
// account selection (localStorage + a window event so every mounted page
// reacts), and guardrail resolution - a specific account's own limits win,
// user_settings stays the fallback for "all accounts" or accountless trades.
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptySettings, type UserSettings } from "@/lib/settings";

export type Account = {
  id: string;
  name: string;
  firm: string | null;
  phase: "challenge" | "verification" | "funded" | "personal" | "demo" | null;
  size: number | null;
  currency: string | null;
  status: "active" | "passed" | "failed" | "closed";
  max_trades_per_day: number | null;
  max_daily_loss: string | null;
  max_daily_profit: string | null;
  trading_window: string | null;
  trading_window_2: string | null;
  started_on: string;
  ended_on: string | null;
  successor_of: string | null;
  notes: string | null;
  // Cosmetic hide (migration 0020); absent before it, treated as false.
  hidden?: boolean;
};

export const ACCOUNT_PHASES = ["challenge", "verification", "funded", "personal", "demo"] as const;

// Selection: "all" or an account id. Persisted per device.
const SEL_KEY = "tb_account";
export const ALL_ACCOUNTS = "all";

export async function fetchAccounts(
  supabase: SupabaseClient
): Promise<{ accounts: Account[]; available: boolean }> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { accounts: [], available: false }; // migration 0019 not applied
  return { accounts: (data as Account[]) ?? [], available: true };
}

export function getSelectedAccountId(): string {
  if (typeof window === "undefined") return ALL_ACCOUNTS;
  return localStorage.getItem(SEL_KEY) || ALL_ACCOUNTS;
}

export function setSelectedAccountId(id: string) {
  localStorage.setItem(SEL_KEY, id);
  // Mirror into a cookie so server-rendered pages (dashboard) can scope on
  // the FIRST paint instead of flashing "all accounts" and re-rendering.
  document.cookie = `${SEL_KEY}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("tb:account-changed", { detail: { id } }));
}

// Selected account id, kept in sync across every component that uses it.
// Initialised synchronously from localStorage so the FIRST render (and the
// first data fetch) is already scoped - starting at "all" and correcting in
// an effect made every page briefly show other accounts' data.
export function useSelectedAccount(): [string, (id: string) => void] {
  const [sel, setSel] = useState<string>(getSelectedAccountId);
  useEffect(() => {
    const cur = getSelectedAccountId();
    setSel(cur);
    // Backfill the cookie for selections saved before the cookie mirror
    // existed, so the server-rendered dashboard scopes on first paint.
    document.cookie = `${SEL_KEY}=${encodeURIComponent(cur)}; path=/; max-age=31536000; SameSite=Lax`;
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setSel(id);
    };
    window.addEventListener("tb:account-changed", onChange);
    return () => window.removeEventListener("tb:account-changed", onChange);
  }, []);
  return [sel, setSelectedAccountId];
}

// Effective guardrails: the selected account's own limits when one is
// selected (any unset field falls back to the defaults), else the defaults.
export function effectiveGuardrails(
  account: Account | null,
  defaults: UserSettings
): UserSettings {
  if (!account) return defaults;
  return {
    ...emptySettings(),
    // routine + notifications + tutorial stay personal, not per account
    routine_items: defaults.routine_items,
    routine_notify: defaults.routine_notify,
    routine_remind_at: defaults.routine_remind_at,
    warn_on_charts: defaults.warn_on_charts,
    tutorial_done: defaults.tutorial_done,
    max_trades_per_day: account.max_trades_per_day ?? defaults.max_trades_per_day,
    max_daily_loss: account.max_daily_loss ?? defaults.max_daily_loss,
    max_daily_profit: account.max_daily_profit ?? defaults.max_daily_profit,
    trading_window: account.trading_window ?? defaults.trading_window,
    trading_window_2: account.trading_window_2 ?? defaults.trading_window_2,
  };
}

export function accountStatusTone(status: Account["status"]): string {
  switch (status) {
    case "active":
      return "border-accent/50 bg-accent-soft text-accent2";
    case "passed":
      return "border-success/40 bg-success/10 text-success";
    case "failed":
      return "border-danger/40 bg-danger/10 text-danger";
    default:
      return "border-border2 text-dim";
  }
}
