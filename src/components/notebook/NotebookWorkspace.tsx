"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePairs } from "@/lib/usePairs";
import AnalysisPanel from "@/components/charts/AnalysisPanel";
import BlockEditor, { NoteView } from "./BlockEditor";

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


// True while the user is typing in any editable control; keyboard-delete
// shortcuts must stay inert then, or Backspace while editing text would
// threaten the whole record.
function isTypingTarget() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export default function NotebookWorkspace() {
  const supabase = createClient();
  const watchlist = usePairs();
  const [list, setList] = useState<NoteRow[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Notes open read-only, like strategies; Edit switches to the block editor.
  const [noteMode, setNoteMode] = useState<"view" | "edit">("view");
  const [showLog, setShowLog] = useState(false);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const dirty = useRef(false);
  // Content as it was when edit mode was entered, so "Cancel edits" can revert
  // the autosaved changes back to that state.
  const editSnapshot = useRef<{ title: string; content: string; pair?: string | null } | null>(null);

  // The floating Edit/Done pill shares the bottom-right corner with the
  // Sidekick launcher. Flag the body while a note is open so the launcher
  // lifts above the pill (data-fab), and hide it entirely while editing
  // (data-editing). Rules live in globals.css.
  useEffect(() => {
    if (note) document.body.dataset.fab = "1";
    else delete document.body.dataset.fab;
    if (note && noteMode === "edit") document.body.dataset.editing = "1";
    else delete document.body.dataset.editing;
    return () => {
      delete document.body.dataset.fab;
      delete document.body.dataset.editing;
    };
  }, [note, noteMode]);

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

  // Backspace/Delete (outside text fields) asks to delete the open note.
  // While the confirm dialog is open: Enter deletes, Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && pendingRef.current && !isTypingTarget()) {
        e.preventDefault();
        undoDelete();
        return;
      }
      if (confirmDelete) {
        if (e.key === "Enter") {
          e.preventDefault();
          performDelete();
        } else if (e.key === "Escape") {
          setConfirmDelete(false);
        }
        return;
      }
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (!note || showLog || isTypingTarget()) return;
      e.preventDefault();
      setConfirmDelete(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, confirmDelete, showLog]);

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
    setNoteMode("view");
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
      setNoteMode("edit");
      setNote({ id: data.id, title: data.title, content: data.content ?? "", pinned: false });
      loadList();
    }
  }

  function edit(patch: Partial<Note>) {
    dirty.current = true;
    setNote((n) => (n ? { ...n, ...patch } : n));
  }

  // Snapshot the note when edit mode opens (once), clear it back in view mode.
  useEffect(() => {
    if (note && noteMode === "edit") {
      if (!editSnapshot.current) {
        editSnapshot.current = { title: note.title, content: note.content, pair: note.pair };
      }
    } else {
      editSnapshot.current = null;
    }
  }, [note, noteMode]);

  // Discard edits made in this session: restore the snapshot, persist the
  // revert (autosave may already have written interim changes), leave edit mode.
  async function cancelEdits() {
    const snap = editSnapshot.current;
    if (note && snap) {
      dirty.current = false;
      setNote({ ...note, ...snap });
      const patch: { title: string; content: string; pair?: string | null } = {
        title: snap.title || "Untitled",
        content: snap.content,
      };
      if (snap.pair !== undefined) patch.pair = snap.pair || null;
      await supabase.from("notes").update(patch).eq("id", note.id);
      setStatus("Reverted");
      setList((ls) => ls.map((n) => (n.id === note.id ? { ...n, title: snap.title || "Untitled" } : n)));
    }
    editSnapshot.current = null;
    setNoteMode("view");
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

  // Confirmed deletes get a 5s grace period: the note disappears from the
  // UI immediately but the row is only removed when the toast expires, so
  // Undo restores it fully intact (same id, same content).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
  const pendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  function finalizePendingDelete() {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    createClient().from("notes").delete().eq("id", p.id).then(() => {});
  }
  // Leaving the page with a delete still pending: make it real.
  useEffect(() => () => finalizePendingDelete(), []);

  function performDelete() {
    setConfirmDelete(false);
    if (!note) return;
    finalizePendingDelete();
    const id = note.id;
    const label = note.title || "Untitled";
    dirty.current = false;
    setNote(null);
    setList((ls) => ls.filter((x) => x.id !== id));
    const timer = setTimeout(() => {
      pendingRef.current = null;
      setPendingDelete(null);
      supabase.from("notes").delete().eq("id", id).then(() => {});
    }, 5000);
    pendingRef.current = { id, timer };
    setPendingDelete({ id, label });
  }

  function undoDelete() {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    loadList();
    openNote(p.id);
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

      {/* min-w-0: without it the horizontally scrolling chip strip sets this
          flex item's minimum width and the whole page overflows the phone
          viewport (search bar and cards bleed off the right edge). */}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
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
            <button
              onClick={async () => {
                const n = note;
                setNote(null);
                await flushSave(n);
                await discardIfEmpty(n);
                loadList();
              }}
              className="mb-2 inline-flex items-center gap-1 text-sm text-accent2 md:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              Notes
            </button>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {noteMode === "edit" ? (
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
              ) : (
                <h1 className="min-w-0 flex-1 basis-full truncate text-2xl font-semibold sm:basis-auto" style={{ fontFamily: "var(--font-display)" }}>
                  {note.title || "Untitled"}
                </h1>
              )}
              {noteMode === "edit" ? (
                <>
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
                </>
              ) : (
                note.pair && (
                  <span className="rounded-md border border-border2 px-2 py-1 font-mono text-xs text-muted">{note.pair}</span>
                )
              )}
              <span className="text-xs text-dim">{status}</span>
              <button
                onClick={() => setNoteMode((m) => (m === "view" ? "edit" : "view"))}
                className={`rounded-lg border px-2.5 py-2 text-sm transition ${noteMode === "edit" ? "border-accent text-accent2" : "border-border2 text-muted hover:border-accent hover:text-foreground"}`}
              >
                {noteMode === "edit" ? "Done" : "Edit"}
              </button>
              {noteMode === "edit" && (
                <button
                  onClick={cancelEdits}
                  title="Discard changes made since you opened the editor"
                  className="rounded-lg border border-border2 px-2.5 py-2 text-sm text-muted transition hover:border-danger hover:text-danger"
                >
                  Cancel edits
                </button>
              )}
              <button onClick={togglePin} title="Pin" className={`rounded-lg border px-2.5 py-2 text-sm ${note.pinned ? "border-accent text-accent2" : "border-border2 text-muted"}`}>
                {note.pinned ? "Pinned" : "Pin"}
              </button>
              <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-border2 px-2.5 py-2 text-sm text-muted transition hover:border-danger hover:text-danger">Delete</button>
            </div>
            {/* Floating mode toggle so long notes don't require scrolling
                back to the header. Sits above the mobile tab bar and clear
                of the floating palette's default spot. */}
            <button
              onClick={() => setNoteMode((m) => (m === "view" ? "edit" : "view"))}
              className={`fixed bottom-40 right-3 z-40 rounded-full px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur transition md:bottom-8 md:right-8 ${
                noteMode === "edit"
                  ? "bg-accent text-white hover:opacity-90"
                  : "border border-border2 bg-card/95 text-foreground hover:border-accent"
              }`}
            >
              {noteMode === "edit" ? "Done" : "Edit"}
            </button>
            <div className="min-h-[60vh] rounded-xl border border-border bg-card p-5">
              {noteMode === "edit" ? (
                <BlockEditor
                  key={note.id}
                  initial={note.content}
                  onChange={(c) => edit({ content: c })}
                />
              ) : (
                <NoteView content={note.content} onChange={(c) => edit({ content: c })} />
              )}
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

      {pendingDelete && (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-xl border border-border2 bg-card px-4 py-2.5 shadow-xl md:bottom-6">
          <span className="max-w-[60vw] truncate text-sm text-muted">Deleted &ldquo;{pendingDelete.label}&rdquo;</span>
          <button onClick={undoDelete} className="text-sm font-medium text-accent2 hover:underline">Undo</button>
        </div>
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
