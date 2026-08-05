"use client";

// Headless flow on the Trading page: the camera menu captures the chart and
// dispatches "tb:snap-to-note" with the blob; this uploads it and asks which
// note to file it in (chosen or new) with a timestamp line. No button of its
// own - the trigger lives in SnapshotMenu.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const uid = () => Math.random().toString(36).slice(2, 10);
const BUCKET = "entry-models";

type NoteRow = { id: string; title: string; updated_at: string };
type NoteBlock = { id: string; type: string; text: string };

export default function SnapToNote({ symbol }: { symbol: string }) {
  const supabase = createClient();
  const [path, setPath] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const stampNow = () => {
    const d = new Date();
    return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  };

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  }

  useEffect(() => {
    const onSnap = async (e: Event) => {
      const blob = (e as CustomEvent<{ blob?: Blob }>).detail?.blob;
      if (!blob) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        flash("Not signed in.");
        return;
      }
      const p = `${u.user.id}/analysis/snap-${uid()}.png`;
      const { error } = await supabase.storage.from(BUCKET).upload(p, blob, { contentType: "image/png" });
      if (error) {
        flash(`Upload failed: ${error.message}`);
        return;
      }
      const { data } = await supabase
        .from("notes")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      setNotes((data as NoteRow[]) ?? []);
      setQ("");
      setPath(p);
    };
    window.addEventListener("tb:snap-to-note", onSnap);
    return () => window.removeEventListener("tb:snap-to-note", onSnap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocks = (p: string): NoteBlock[] => [
    { id: uid(), type: "text", text: `${symbol} chart - ${stampNow()}` },
    { id: uid(), type: "img", text: p },
  ];

  async function toNewNote() {
    if (!path) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const row: { user_id: string; title: string; content: string; pair?: string } = {
      user_id: u.user.id,
      title: `${symbol} chart ${stampNow()}`,
      content: JSON.stringify({ blocks: blocks(path) }),
      pair: symbol,
    };
    let { error } = await supabase.from("notes").insert(row);
    if (error && /pair/i.test(error.message)) {
      delete row.pair;
      ({ error } = await supabase.from("notes").insert(row));
    }
    if (error) {
      flash(`Could not save note: ${error.message}`);
      return;
    }
    setPath(null);
    flash("Chart sent to a new note.");
  }

  // Re-reads the note right before writing so a stale copy never clobbers
  // newer edits.
  async function toNote(noteId: string, title: string) {
    if (!path) return;
    const { data: n, error: readErr } = await supabase.from("notes").select("content").eq("id", noteId).single();
    if (readErr || !n) {
      flash("Could not open that note.");
      return;
    }
    let existing: NoteBlock[] = [];
    try {
      const j = JSON.parse(n.content ?? "");
      if (j && Array.isArray(j.blocks)) existing = j.blocks;
      else if (n.content) existing = [{ id: uid(), type: "text", text: String(n.content) }];
    } catch {
      if (n.content) existing = [{ id: uid(), type: "text", text: n.content }];
    }
    const { error } = await supabase
      .from("notes")
      .update({ content: JSON.stringify({ blocks: [...existing, ...blocks(path)] }) })
      .eq("id", noteId);
    if (error) {
      flash(`Could not update note: ${error.message}`);
      return;
    }
    setPath(null);
    flash(`Chart added to "${title || "Untitled"}".`);
  }

  return (
    <>
      {path && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setPath(null)}>
          <div
            className="absolute right-4 top-16 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border2 bg-card p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-dim">Chart captured. Add it to which note?</span>
              <button onClick={() => setPath(null)} className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes..." className="jfield mb-2" />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              <button
                onClick={toNewNote}
                className="block w-full rounded-md px-2.5 py-2 text-left text-sm font-medium text-accent2 transition hover:bg-surface2"
              >
                + New note
              </button>
              {notes
                .filter((n) => !q.trim() || (n.title || "Untitled").toLowerCase().includes(q.toLowerCase()))
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => toNote(n.id, n.title)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition hover:bg-surface2"
                  >
                    <span className="truncate">{n.title || "Untitled"}</span>
                    <span className="shrink-0 text-xs text-dim">
                      {new Date(n.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border2 bg-card px-4 py-2.5 text-sm text-muted shadow-xl md:bottom-6">
          {msg}
        </div>
      )}
    </>
  );
}
