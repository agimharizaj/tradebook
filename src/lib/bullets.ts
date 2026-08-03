// Lightweight bullet-list behaviour for plain <textarea> note fields:
// - typing "-" then space at the start of a line becomes "• "
// - Enter on a bullet line continues the list with a fresh "• "
// - Enter or Backspace on an EMPTY bullet removes it (back to plain text)
// The bullets are stored as literal "• " characters, so notes stay plain
// text everywhere (DB, AI context, exports).
import type React from "react";

export function bulletKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>
): { next: string; caret: number } | null {
  const el = e.currentTarget;
  const s = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (s !== end) return null; // never fight a selection
  const value = el.value;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const line = value.slice(lineStart, s);

  // "-" + space at line start -> bullet
  if (e.key === " " && line === "-") {
    e.preventDefault();
    return { next: value.slice(0, lineStart) + "• " + value.slice(s), caret: lineStart + 2 };
  }

  if (e.key === "Enter" && line.startsWith("• ")) {
    e.preventDefault();
    // Empty bullet: exit the list instead of stacking markers.
    if (line.trim() === "•") {
      return { next: value.slice(0, lineStart) + value.slice(s), caret: lineStart };
    }
    const insert = "\n• ";
    return { next: value.slice(0, s) + insert + value.slice(s), caret: s + insert.length };
  }

  // Backspace right after an empty bullet marker -> plain line
  if (e.key === "Backspace" && line === "• ") {
    e.preventDefault();
    return { next: value.slice(0, lineStart) + value.slice(s), caret: lineStart };
  }

  return null;
}

// Apply a bulletKeyDown result to a controlled textarea: hand the new value
// to state and restore the caret once React has re-rendered.
export function applyBulletEdit(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onValue: (v: string) => void
): boolean {
  const r = bulletKeyDown(e);
  if (!r) return false;
  const el = e.currentTarget;
  onValue(r.next);
  requestAnimationFrame(() => el.setSelectionRange(r.caret, r.caret));
  return true;
}
