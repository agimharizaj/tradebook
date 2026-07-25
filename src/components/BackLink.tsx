"use client";

import { useRouter } from "next/navigation";

// "Back" that returns to the page the user actually came from (e.g. the
// risk calculator's Edit pairs link), falling back to a fixed route when
// the page was opened directly.
export default function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="inline-flex items-center gap-1 text-sm text-accent2 hover:underline"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      {label}
    </button>
  );
}
