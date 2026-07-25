"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BlockEditor from "./BlockEditor";

type NoteRow = { id: string; title: string; updated_at: string; pinned: boolean };
type Note = { id: string; title: string; content: string; pinned: boolean };

export default function NotebookWorkspace() {
  const supabase = createClient();
  const [list, setList] = useState<NoteRow[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  const dirty = useRef(false);

  const loadList = useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select("id, title, updated_at, pinned")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setList((data as NoteRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function openNote(id: string) {
    const { data } = await supabase.from("notes").select("*").eq("id", id).single();
    if (!data) return;
    dirty.current = false;
    setStatus("");
    setNote({ id: data.id, title: data.title ?? "", content: data.content ?? "", pinned: !!data.pinned });
  }

  async function newNote() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setStatus("Not signed in.");
      return;
    }
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: u.user.id, title: "Untitled", content: "" })
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
      await supabase
        .from("notes")
        .update({ title: note.title || "Untitled", content: note.content })
        .eq("id", note.id);
      dirty.current = false;
      setStatus("Saved");
      loadList();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.title, note?.content]);

  async function togglePin() {
    if (!note) return;
    const pinned = !note.pinned;
    setNote({ ...note, pinned });
    await supabase.from("notes").update({ pinned }).eq("id", note.id);
    loadList();
  }

  async function del() {
    if (!note) return;
    if (!confirm("Delete this note?")) return;
    await supabase.from("notes").delete().eq("id", note.id);
    setNote(null);
    loadList();
  }

  return (
    <div className="flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start overflow-y-auto border-r border-border p-4 md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-dim">Notes</span>
          <button onClick={newNote} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">+ New</button>
        </div>
        <NoteList list={list} activeId={note?.id} onOpen={openNote} />
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
          <button onClick={newNote} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">+ New</button>
          {list.map((n) => (
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
            <div className="mb-3 flex items-center gap-2">
              <input
                value={note.title}
                onChange={(e) => edit({ title: e.target.value })}
                placeholder="Note title"
                className="flex-1 border-none bg-transparent text-2xl font-semibold outline-none placeholder:text-dim"
                style={{ fontFamily: "var(--font-display)" }}
              />
              <span className="text-xs text-dim">{status}</span>
              <button onClick={togglePin} title="Pin" className={`rounded-lg border px-2.5 py-2 text-sm ${note.pinned ? "border-accent text-accent2" : "border-border2 text-muted"}`}>
                {note.pinned ? "Pinned" : "Pin"}
              </button>
              <button onClick={del} className="rounded-lg border border-border2 px-2.5 py-2 text-sm text-muted transition hover:border-danger hover:text-danger">Delete</button>
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
    </div>
  );
}

function NoteList({ list, activeId, onOpen }: { list: NoteRow[]; activeId?: string; onOpen: (id: string) => void }) {
  if (list.length === 0) return <p className="text-sm text-muted">No notes yet.</p>;
  return (
    <div className="space-y-1">
      {list.map((n) => (
        <button
          key={n.id}
          onClick={() => onOpen(n.id)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
            activeId === n.id ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"
          }`}
        >
          {n.pinned && <span className="text-xs text-accent2">●</span>}
          <span className="truncate">{n.title || "Untitled"}</span>
        </button>
      ))}
    </div>
  );
}
