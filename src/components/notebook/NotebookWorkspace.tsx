"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePairs } from "@/lib/usePairs";
import AnalysisPanel from "@/components/charts/AnalysisPanel";
import BlockEditor from "./BlockEditor";

type NoteRow = { id: string; title: string; updated_at: string; created_at: string; pinned: boolean };
// pair is undefined until migration 0006 adds the column; updates only send
// it when defined so the app keeps working before the migration runs.
type Note = { id: string; title: string; content: string; pinned: boolean; pair?: string | null };

// New notes are titled with today's date by default; select-on-focus makes
// replacing it one keystroke, and clearing it is fine (falls back to "Untitled").
const defaultTitle = () =>
  new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// A note the user never actually wrote in: default/blank title and no
// block with any text. These are silently discarded instead of saved.
function isEmptyNote(n: Note) {
  const t = n.title.trim();
  if (t && t !== "Untitled" && t !== defaultTitle()) return false;
  if (!n.content.trim()) return true;
  try {
    const j = JSON.parse(n.content);
    if (j && Array.isArray(j.blocks)) {
      return j.blocks.every((b: { text?: string }) => !(b.text ?? "").trim());
    }
  } catch {
    return !n.content.trim();
  }
  return false;
}

export default function NotebookWorkspace() {
  const supabase = createClient();
  const watchlist = usePairs();
  const [list, setList] = useState<NoteRow[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const dirty = useRef(false);

  // Search by title plus optional created-date range.
  const filteredList = list.filter((n) => {
    if (q.trim() && !(n.title || "Untitled").toLowerCase().includes(q.toLowerCase())) return false;
    const created = n.created_at?.slice(0, 10) ?? "";
    if (fromDate && created < fromDate) return false;
    if (toDate && created > toDate) return false;
    return true;
  });

  const loadList = useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select("id, title, updated_at, created_at, pinned")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setList((data as NoteRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Delete the given note if the user never wrote in it.
  const discardIfEmpty = useCallback(
    async (n: Note | null) => {
      if (!n || !isEmptyNote(n)) return;
      await supabase.from("notes").delete().eq("id", n.id);
      setList((ls) => ls.filter((x) => x.id !== n.id));
    },
    [supabase]
  );

  // Flush a pending (debounced) save immediately so switching notes within
  // the 700ms autosave window never drops the last keystrokes.
  const flushSave = useCallback(
    async (n: Note | null) => {
      if (!n || !dirty.current || isEmptyNote(n)) return;
      const patch: { title: string; content: string; pair?: string | null } = {
        title: n.title || "Untitled",
        content: n.content,
      };
      if (n.pair !== undefined) patch.pair = n.pair || null;
      await supabase.from("notes").update(patch).eq("id", n.id);
      dirty.current = false;
    },
    [supabase]
  );

  // Also discard an untouched note when leaving the page entirely.
  const noteRef = useRef<Note | null>(null);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);
  useEffect(() => {
    return () => {
      const n = noteRef.current;
      if (!n) return;
      const c = createClient();
      if (isEmptyNote(n)) {
        c.from("notes").delete().eq("id", n.id).then(() => {});
      } else if (dirty.current) {
        // Leaving the page with a save still debounced: write it now.
        c.from("notes")
          .update({ title: n.title || "Untitled", content: n.content })
          .eq("id", n.id)
          .then(() => {});
      }
    };
  }, []);

  async function openNote(id: string) {
    if (note && note.id !== id) {
      discardIfEmpty(note);
      flushSave(note);
    }
    const { data } = await supabase.from("notes").select("*").eq("id", id).single();
    if (!data) return;
    dirty.current = false;
    setStatus("");
    setNote({
      id: data.id,
      title: data.title ?? "",
      content: data.content ?? "",
      pinned: !!data.pinned,
      pair: "pair" in data ? ((data.pair as string | null) ?? "") : undefined,
    });
  }

  async function newNote() {
    // Reuse the current note if it is still untouched instead of stacking
    // empty "Untitled" rows.
    if (note && isEmptyNote(note)) return;
    flushSave(note);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setStatus("Not signed in.");
      return;
    }
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: u.user.id, title: defaultTitle(), content: "" })
      .select("*")
      .single();
    if (error) {
      setStatus(
        /relation .* does not exist|notes/.test(error.message)
          ? "Notes table missing. Run migration 0003_notes.sql in Supabase."
          : `Error: ${error.message}`
      );
      return;
    }
    if (data) {
      dirty.current = false;
      setNote({ id: data.id, title: data.title, content: data.content ?? "", pinned: false });
      loadList();
    }
  }

  function edit(patch: Partial<Note>) {
    dirty.current = true;
    setNote((n) => (n ? { ...n, ...patch } : n));
  }

  useEffect(() => {
    if (!note || !dirty.current) return;
    setStatus("Saving...");
    const t = setTimeout(async () => {
      const patch: { title: string; content: string; pair?: string | null } = {
        title: note.title || "Untitled",
        content: note.content,
      };
      if (note.pair !== undefined) patch.pair = note.pair || null;
      const { error } = await supabase.from("notes").update(patch).eq("id", note.id);
      dirty.current = false;
      setStatus(error ? `Save failed: ${error.message}` : "Saved");
      // Update the list title in place; do not re-sort while editing.
      setList((ls) => ls.map((n) => (n.id === note.id ? { ...n, title: note.title || "Untitled" } : n)));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.title, note?.content, note?.pair]);

  async function togglePin() {
    if (!note) return;
    const pinned = !note.pinned;
    setNote({ ...note, pinned });
    await supabase.from("notes").update({ pinned }).eq("id", note.id);
    loadList();
  }

  async function performDelete() {
    setConfirmDelete(false);
    if (!note) return;
    await supabase.from("notes").delete().eq("id", note.id);
    setNote(null);
    loadList();
  }

  return (
    <div className="flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start overflow-y-auto border-r border-border p-4 md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-dim">Notes</span>
          <span className="flex items-center gap-1.5">
            <button
              onClick={() => setShowLog(true)}
              className="rounded-md border border-border2 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              Analysis
            </button>
            <button onClick={newNote} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">+ New</button>
          </span>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes..."
          className="jfield mb-2"
        />
        <div className="mb-3 flex items-center gap-1.5">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="jfield min-w-0"
            aria-label="Created from"
            title="Created from"
          />
          <span className="shrink-0 text-xs text-dim">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="jfield min-w-0"
            aria-label="Created to"
            title="Created to"
          />
        </div>
        {(q || fromDate || toDate) && (
          <button
            onClick={() => { setQ(""); setFromDate(""); setToDate(""); }}
            className="mb-2 text-xs text-accent2 hover:underline"
          >
            Clear filters ({filteredList.length} of {list.length})
          </button>
        )}
        <NoteList list={filteredList} activeId={note?.id} onOpen={openNote} />
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mb-2 md:hidden">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes..."
            className="jfield"
          />
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
          <button onClick={newNote} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">+ New</button>
          <button
            onClick={() => setShowLog(true)}
            className="shrink-0 rounded-lg border border-border2 px-3 py-1.5 text-xs font-medium text-muted"
          >
            Analysis
          </button>
          {filteredList.map((n) => (
            <button
              key={n.id}
              onClick={() => openNote(n.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs ${note?.id === n.id ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted"}`}
            >
              {n.title || "Untitled"}
            </button>
          ))}
        </div>

        {!note ? (
          <div className="mx-auto max-w-2xl pt-4 md:pt-16 md:text-center">
            <h1 className="text-2xl">Notebook</h1>
            <p className="mt-2 text-muted">Think before you trade. Review before you repeat.</p>
            <button onClick={newNote} className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white">+ New note</button>
            {status && <p className="mt-3 text-sm text-danger">{status}</p>}
            {list.length > 0 && (
              <div className="mt-6 space-y-2 md:hidden">
                {list.map((n) => (
                  <button key={n.id} onClick={() => openNote(n.id)} className="block w-full rounded-lg border border-border2 px-4 py-3 text-left text-sm text-foreground">
                    {n.title || "Untitled"}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={note.title}
                onChange={(e) => edit({ title: e.target.value })}
                onFocus={(e) => {
                  if (note.title === "Untitled" || note.title === defaultTitle()) e.target.select();
                }}
                placeholder="Note title"
                className="min-w-0 flex-1 basis-full border-none bg-transparent text-2xl font-semibold outline-none placeholder:text-dim sm:basis-auto"
                style={{ fontFamily: "var(--font-display)" }}
              />
              <select
                value={note.pair ?? ""}
                onChange={(e) => edit({ pair: e.target.value })}
                className="rounded-lg border border-border2 bg-surface2 px-2 py-2 text-xs text-muted outline-none focus:border-accent"
                aria-label="Pair"
                title="Tag this note with a pair (edit the list in Profile)"
              >
                <option value="">No pair</option>
                {watchlist.map((pr) => (<option key={pr} value={pr}>{pr}</option>))}
                {note.pair && !watchlist.includes(note.pair) && (
                  <option value={note.pair}>{note.pair}</option>
                )}
              </select>
              <Link href="/profile/pairs" className="text-[11px] text-accent2 hover:underline">Edit</Link>
              <span className="text-xs text-dim">{status}</span>
              <button onClick={togglePin} title="Pin" className={`rounded-lg border px-2.5 py-2 text-sm ${note.pinned ? "border-accent text-accent2" : "border-border2 text-muted"}`}>
                {note.pinned ? "Pinned" : "Pin"}
              </button>
              <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-border2 px-2.5 py-2 text-sm text-muted transition hover:border-danger hover:text-danger">Delete</button>
            </div>
            <div className="min-h-[60vh] rounded-xl border border-border bg-card p-5">
              <BlockEditor
                key={note.id}
                initial={note.content}
                onChange={(c) => edit({ content: c })}
              />
            </div>
          </div>
        )}
      </main>

      {showLog && (
        <AnalysisPanel
          defaultSymbol={watchlist[0] ?? "EUR/USD"}
          onClose={() => {
            setShowLog(false);
            loadList();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h2 className="text-lg">Delete note?</h2>
            <p className="mt-2 text-sm text-muted">
              &ldquo;{note?.title || "This note"}&rdquo; will be permanently removed. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground">Cancel</button>
              <button onClick={performDelete} className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteList({ list, activeId, onOpen }: { list: NoteRow[]; activeId?: string; onOpen: (id: string) => void }) {
  if (list.length === 0) return <p className="text-sm text-muted">No notes yet.</p>;
  const when = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  return (
    <div className="space-y-1.5">
      {list.map((n) => {
        const active = activeId === n.id;
        return (
          <button
            key={n.id}
            onClick={() => onOpen(n.id)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
              active
                ? "border-accent bg-accent-soft"
                : "border-border bg-card hover:border-accent"
            }`}
          >
            <span className="flex items-center gap-2">
              {n.pinned && <span className="shrink-0 text-[10px] text-accent2">●</span>}
              <span className={`truncate text-sm font-medium ${active ? "text-accent2" : "text-foreground"}`}>
                {n.title || "Untitled"}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-dim">{when(n.created_at)}</span>
          </button>
        );
      })}
    </div>
  );
}
