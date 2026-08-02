"use client";

// Microphone toggle for any text field: dictated speech is appended to the
// field through onText. Hidden entirely when the browser has no Web Speech
// support (matches the SnapTo* pattern of not showing dead controls).
import { useSpeech } from "@/lib/useSpeech";

export default function MicButton({
  onText,
  className = "",
  title = "Dictate",
}: {
  onText: (text: string) => void;
  className?: string;
  title?: string;
}) {
  const { supported, listening, toggle } = useSpeech(onText);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop dictating" : title}
      aria-label={listening ? "Stop dictating" : title}
      aria-pressed={listening}
      className={`inline-flex items-center justify-center rounded-lg border p-2 transition ${
        listening
          ? "border-danger bg-danger/15 text-danger"
          : "border-border2 text-muted hover:border-accent hover:text-foreground"
      } ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
      </svg>
      {listening && (
        <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
      )}
    </button>
  );
}
