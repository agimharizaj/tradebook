"use client";

// Fullscreen editor for the small note fields (day note, trade reflection):
// same value, same autosave path, just room to think. Escape or backdrop
// closes; dictation and bullet shortcuts work here too.
import { useEffect, useRef } from "react";
import MicButton from "@/components/MicButton";
import { applyBulletEdit } from "@/lib/bullets";

export default function NoteExpandModal({
  title,
  value,
  placeholder,
  disabled = false,
  onChange,
  onClose,
}: {
  title: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 md:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex h-full max-h-[46rem] w-full max-w-2xl flex-col rounded-2xl bg-card p-4 ring-1 ring-border2 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h3>
          <div className="flex items-center gap-1.5">
            <MicButton
              onText={(t) => onChange(value ? `${value} ${t}` : t)}
              title={`Dictate ${title.toLowerCase()}`}
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-border2 p-2 text-muted transition hover:border-accent hover:text-foreground"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => applyBulletEdit(e, onChange)}
          placeholder={placeholder}
          disabled={disabled}
          className="jfield min-h-0 w-full flex-1 resize-none !text-[15px] leading-relaxed"
          aria-label={title}
        />
        <p className="mt-2 text-[11px] text-dim">
          Autosaves as you type. Type “-” then space for a bullet; Enter continues the list.
        </p>
      </div>
    </div>
  );
}
