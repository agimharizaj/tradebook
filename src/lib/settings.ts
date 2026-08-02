// Account-level settings (migration 0016) plus the guardrail math shared by
// the Journal panel, the Charts trading-day panel, and the AI context.
// Everything degrades gracefully when the user_settings table does not exist
// yet: fetchSettings returns defaults with available=false and callers skip
// persistence.
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserSettings = {
  max_trades_per_day: number | null;
  // Figure ("200") or percent of account ("5%"), same convention as 0013.
  max_daily_loss: string | null;
  max_daily_profit: string | null;
  trading_window: string | null;
  trading_window_2: string | null;
  routine_items: string[];
  routine_notify: boolean;
  routine_remind_at: string | null; // "HH:MM" local time
  warn_on_charts: boolean;
  tutorial_done: boolean;
};

export const DEFAULT_ROUTINE = [
  "Meditate 15 mins",
  "Review your trading plan",
  "Review charts",
];

export function emptySettings(): UserSettings {
  return {
    max_trades_per_day: null,
    max_daily_loss: null,
    max_daily_profit: null,
    trading_window: null,
    trading_window_2: null,
    routine_items: [...DEFAULT_ROUTINE],
    routine_notify: false,
    routine_remind_at: null,
    warn_on_charts: true,
    tutorial_done: false,
  };
}

export async function fetchSettings(
  supabase: SupabaseClient
): Promise<{ settings: UserSettings; available: boolean }> {
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  // error => table missing (migration 0016 not applied) or transient failure;
  // either way run on defaults and skip writes.
  if (error) return { settings: emptySettings(), available: false };
  if (!data) return { settings: emptySettings(), available: true };
  const d = data as Record<string, unknown>;
  const items = Array.isArray(d.routine_items)
    ? (d.routine_items as unknown[]).filter((x): x is string => typeof x === "string")
    : [...DEFAULT_ROUTINE];
  return {
    available: true,
    settings: {
      max_trades_per_day: (d.max_trades_per_day as number | null) ?? null,
      max_daily_loss: (d.max_daily_loss as string | null) ?? null,
      max_daily_profit: (d.max_daily_profit as string | null) ?? null,
      trading_window: (d.trading_window as string | null) ?? null,
      trading_window_2: (d.trading_window_2 as string | null) ?? null,
      routine_items: items,
      routine_notify: !!d.routine_notify,
      routine_remind_at: (d.routine_remind_at as string | null) ?? null,
      warn_on_charts: d.warn_on_charts !== false,
      tutorial_done: !!d.tutorial_done,
    },
  };
}

export async function saveSettings(
  supabase: SupabaseClient,
  patch: Partial<UserSettings>
): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return "Not signed in.";
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: u.user.id, ...patch }, { onConflict: "user_id" });
  return error ? error.message : null;
}

// A risk limit is either a figure ("200") or a percent of account ("5%").
// Resolve to an absolute number using the account size (null if a percent
// can't be resolved because no account size is set).
export function resolveAmount(v: string | null, accountSize: number): number | null {
  if (!v) return null;
  const s = v.trim();
  if (s.endsWith("%")) {
    const p = parseFloat(s.slice(0, -1));
    return Number.isNaN(p) || !(accountSize > 0) ? null : (p / 100) * accountSize;
  }
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Trading windows: "HH:MM-HH:MM TZ" (TZ optional, defaults to UTC).
// ---------------------------------------------------------------------------
const TZ_ALIASES: Record<string, string> = {
  UTC: "UTC", GMT: "UTC",
  LONDON: "Europe/London", UK: "Europe/London", BST: "Europe/London",
  NY: "America/New_York", "NEW YORK": "America/New_York",
  EST: "America/New_York", EDT: "America/New_York", ET: "America/New_York",
  TOKYO: "Asia/Tokyo", JST: "Asia/Tokyo",
  SYDNEY: "Australia/Sydney", AEST: "Australia/Sydney",
};

export type ParsedWindow = { fromMin: number; toMin: number; tz: string; raw: string };

export function parseWindow(raw: string | null): ParsedWindow | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*(.*)$/);
  if (!m) return null;
  const fromMin = +m[1] * 60 + +m[2];
  const toMin = +m[3] * 60 + +m[4];
  const tzToken = (m[5] || "UTC").trim().toUpperCase();
  const tz = TZ_ALIASES[tzToken] ?? (m[5]?.trim() || "UTC");
  return { fromMin, toMin, tz, raw: raw.trim() };
}

function minutesIn(tz: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(at);
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
    const h = +get("hour") % 24;
    const mi = +get("minute");
    return Number.isNaN(h) || Number.isNaN(mi) ? null : h * 60 + mi;
  } catch {
    return null; // unknown IANA name typed into the window field
  }
}

// Is this instant inside the window? Overnight windows (from > to) wrap.
export function inWindow(w: ParsedWindow, at: Date): boolean {
  const mins = minutesIn(w.tz, at);
  if (mins == null) return true; // unparseable tz: never flag a violation
  return w.fromMin <= w.toMin
    ? mins >= w.fromMin && mins < w.toMin
    : mins >= w.fromMin || mins < w.toMin;
}

export function activeWindows(s: UserSettings): ParsedWindow[] {
  return [parseWindow(s.trading_window), parseWindow(s.trading_window_2)].filter(
    (w): w is ParsedWindow => !!w
  );
}

// Manual journal entries store bare dates (midnight): no time info, so the
// window check must not judge them.
export function hasTimeInfo(tradedOn: string): boolean {
  if (tradedOn.length <= 10) return false;
  return !/T00:00(:00)?/.test(tradedOn.slice(10, 19));
}

// ---------------------------------------------------------------------------
// Guardrail violations, computed live from a day's trades + settings.
// ---------------------------------------------------------------------------
export type Violation = { kind: "window" | "max_trades" | "max_loss"; label: string };

export function computeViolations(
  trades: { traded_on: string; pnl: number | null }[],
  s: UserSettings,
  accountSize: number
): Violation[] {
  const out: Violation[] = [];
  const windows = activeWindows(s);
  if (windows.length) {
    const outside = trades.filter((t) => {
      if (!hasTimeInfo(t.traded_on)) return false;
      const at = new Date(t.traded_on);
      if (Number.isNaN(at.getTime())) return false;
      return !windows.some((w) => inWindow(w, at));
    }).length;
    if (outside > 0) {
      out.push({
        kind: "window",
        label: `Traded outside allowed window ×${outside}`,
      });
    }
  }
  if (s.max_trades_per_day != null && trades.length > s.max_trades_per_day) {
    out.push({
      kind: "max_trades",
      label: `Exceeded max trades per day (${trades.length}/${s.max_trades_per_day})`,
    });
  }
  const lossCap = resolveAmount(s.max_daily_loss, accountSize);
  if (lossCap != null) {
    const net = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    if (net < -Math.abs(lossCap)) {
      out.push({ kind: "max_loss", label: "Exceeded max daily loss ×1" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trade review emotions (fixed EdgeFlo sets; stored as the plain label).
// ---------------------------------------------------------------------------
export const ENTRY_EMOTIONS: { label: string; e: string }[] = [
  { label: "Calm", e: "😌" },
  { label: "FOMO", e: "😨" },
  { label: "Revenge", e: "😡" },
  { label: "Boredom", e: "😑" },
  { label: "Overconfident", e: "😎" },
  { label: "Fear", e: "😰" },
  { label: "Greed", e: "🤑" },
];

export const EXIT_EMOTIONS: { label: string; e: string }[] = [
  { label: "Satisfied", e: "😊" },
  { label: "Regretful", e: "😞" },
  { label: "Frustrated", e: "😤" },
  { label: "Relieved", e: "😌" },
  { label: "Disappointed", e: "😔" },
  { label: "Proud", e: "🏆" },
];

export function emojiFor(label: string | null): string | null {
  if (!label) return null;
  const hit = [...ENTRY_EMOTIONS, ...EXIT_EMOTIONS].find((x) => x.label === label);
  return hit ? hit.e : null;
}

// A trade counts as journaled when its review says something: a reflection,
// any chart image, or tags/emotions.
export type ReviewLite = {
  trade_id: string;
  plan_followed: boolean | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  reflection: string | null;
  htf_path: string | null;
  mtf_path: string | null;
  ltf_path: string | null;
  confluences: string[] | null;
  management: string[] | null;
  mistakes: string[] | null;
};

export function isJournaled(r: ReviewLite | undefined | null): boolean {
  if (!r) return false;
  return !!(
    (r.reflection && r.reflection.trim()) ||
    r.htf_path || r.mtf_path || r.ltf_path ||
    r.entry_emotion || r.exit_emotion ||
    (r.confluences && r.confluences.length) ||
    (r.management && r.management.length) ||
    (r.mistakes && r.mistakes.length)
  );
}
