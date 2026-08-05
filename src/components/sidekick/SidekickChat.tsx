"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Strategy = { id: string; name: string };
// pinned/unread/archived are undefined until migration 0011 adds the
// columns; the UI treats undefined as false and keeps working without them.
type Convo = {
  id: string;
  title: string;
  updated_at: string;
  pinned?: boolean;
  unread?: boolean;
  archived?: boolean;
};

type Msg = {
  role: "user" | "model";
  text: string;
  // Preview for the UI; the base64 payload is only sent for the newest
  // message, older ones become a text placeholder server-side.
  imageUrl?: string;
  image?: { mimeType: string; data: string };
  // Loaded from history: a screenshot was attached but its bytes aren't
  // stored, so render a chip instead of the image.
  hadImage?: boolean;
  strategyName?: string;
  // Context attached via a slash command (/note, /strategy, /analysis).
  // Content rides to the model only on the message being sent; history
  // keeps the kind and title.
  att?: { kind: AttachKind; title: string; content?: string };
  error?: boolean;
};

type AttachKind = "note" | "strategy" | "analysis";
type SlashOption = { id: string; title: string; hint: string };
type NoteRow = { id: string; title: string; content: string | null; updated_at: string };
type AnalysisRow = {
  id: string;
  symbol: string;
  timeframe: string | null;
  direction: string | null;
  notes: string | null;
  image_path: string | null;
  created_at: string;
};

// Chart-analysis screenshots live in the entry-models bucket (see 0005).
const ANALYSIS_BUCKET = "entry-models";
const uid = () => Math.random().toString(36).slice(2, 10);

const SLASH_COMMANDS: { cmd: AttachKind; desc: string }[] = [
  { cmd: "note", desc: "attach a notebook note" },
  { cmd: "strategy", desc: "attach a strategy's rules" },
  { cmd: "analysis", desc: "attach a chart analysis entry" },
];

function KindIcon({ kind }: { kind: AttachKind }) {
  const d =
    kind === "note"
      ? "M15.5 3.5a2.12 2.12 0 0 1 3 3L8 17l-4 1 1-4z"
      : kind === "strategy"
        ? "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        : "M4 19V5M4 19h16M8 15l3-3 3 2 4-5";
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const SUGGESTIONS = [
  "Am I breaking my risk rules?",
  "How is my expectancy trending?",
  "Where am I leaking money?",
  "What's in the latest market news?",
];

// History rows store command attachments as a parseable content prefix
// (no migration needed): "[note: Title] message".
const ATT_PREFIX = /^\[(note|strategy|analysis): (.*?)\] /;

// Downscale to keep the request small and inside Gemini's inline-data limits.
// Takes any Blob: uploaded files and screenshots downloaded from storage.
async function fileToImage(file: Blob): Promise<{ mimeType: string; data: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.split(",")[1], previewUrl: dataUrl };
}

export default function SidekickChat({
  strategies,
  compact = false,
  pendingImage = null,
  onPendingImageUsed,
  pendingText = null,
  onPendingTextUsed,
  pendingDraft = null,
  onPendingDraftUsed,
}: {
  strategies: Strategy[];
  // Compact: used inside the floating dock panel; history lives in a
  // dropdown instead of the side list.
  compact?: boolean;
  // A chart image captured elsewhere (e.g. "Snap to Sidekick" on Charts) to
  // attach to the composer as soon as the chat mounts.
  pendingImage?: Blob | null;
  onPendingImageUsed?: () => void;
  // A question typed into the dock's ask bar before the chat mounted: send
  // it immediately on mount.
  pendingText?: string | null;
  onPendingTextUsed?: () => void;
  // A composer draft (slash command started in the dock): prefill, don't send.
  pendingDraft?: string | null;
  onPendingDraftUsed?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  // Sent with every request so Sidekick knows which app page is on screen
  // ("explain this news", "what am I looking at").
  const pathname = usePathname();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Conversation context menu (⋮), inline rename, archived-view toggle.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Bulk select: tick several chats and archive/delete them in one go.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  // Anchor row for shift-click range selection.
  const lastIndexRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState<{ mimeType: string; data: string; previewUrl: string } | null>(null);
  const [ctxAttach, setCtxAttach] = useState<{ kind: AttachKind; title: string; content: string } | null>(null);
  const [notesList, setNotesList] = useState<NoteRow[] | null>(null);
  const [analysesList, setAnalysesList] = useState<AnalysisRow[] | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [strategyId, setStrategyId] = useState("");

  // A chart snapped in from the Trading page: attach it to the composer once.
  useEffect(() => {
    if (!pendingImage) return;
    let cancelled = false;
    fileToImage(pendingImage).then((img) => {
      if (!cancelled) setAttach(img);
      onPendingImageUsed?.();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImage]);
  const [busy, setBusy] = useState(false);
  // A question handed over from the dock's ask bar: send it once, as soon as
  // the chat is mounted.
  const pendingTextSent = useRef(false);
  useEffect(() => {
    if (!pendingText || pendingTextSent.current) return;
    pendingTextSent.current = true;
    onPendingTextUsed?.();
    send(pendingText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingText]);
  // A draft handed over from the dock (e.g. a "/" command started there):
  // lands in the composer, focused, NOT sent - the slash menu takes over.
  const pendingDraftUsed = useRef(false);
  useEffect(() => {
    if (!pendingDraft || pendingDraftUsed.current) return;
    pendingDraftUsed.current = true;
    onPendingDraftUsed?.();
    setInput(pendingDraft);
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraft]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Double-send guard + cancelling an in-flight reply when switching chats.
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(
    async (id: string) => {
      // Switching away cancels any in-flight reply (its text so far is saved).
      console.info("[sidekick] switching to conversation", id);
      abortRef.current?.abort();
      // Unlock immediately; don't wait for the aborted request to unwind.
      busyRef.current = false;
      setBusy(false);
      setActiveId(id);
      setConfirmDeleteId(null);
      setMenuId(null);
      // Opening a chat clears its unread marker (harmless no-op before
      // migration 0011).
      setConvos((cur) => cur.map((x) => (x.id === id && x.unread ? { ...x, unread: false } : x)));
      supabase.from("ai_conversations").update({ unread: false }).eq("id", id).then(() => {});
      // Prefer the full select (with image_path); fall back to the pre-0012
      // column set if that column isn't there yet.
      type Row = {
        role: "user" | "model";
        content: string;
        strategy_name: string | null;
        has_image: boolean;
        image_path?: string | null;
      };
      let rows: Row[] = [];
      const full = await supabase
        .from("ai_messages")
        .select("role, content, strategy_name, has_image, image_path")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (!full.error) {
        rows = (full.data as Row[]) ?? [];
      } else {
        const basic = await supabase
          .from("ai_messages")
          .select("role, content, strategy_name, has_image")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true });
        if (basic.error) console.warn("[sidekick] load messages failed:", basic.error.message);
        rows = (basic.data as Row[]) ?? [];
      }
      // Sign the stored screenshots so they render inline again.
      const urlMap: Record<string, string> = {};
      const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
      if (paths.length) {
        const signed = await Promise.all(
          paths.map((p) => supabase.storage.from(ANALYSIS_BUCKET).createSignedUrl(p, 3600))
        );
        paths.forEach((p, i) => {
          const url = signed[i].data?.signedUrl;
          if (url) urlMap[p] = url;
        });
      }
      setMessages(
        rows.map((m) => {
          const attMatch = m.content.match(ATT_PREFIX);
          const url = m.image_path ? urlMap[m.image_path] : undefined;
          return {
            role: m.role,
            text: attMatch ? m.content.slice(attMatch[0].length) : m.content,
            ...(attMatch ? { att: { kind: attMatch[1] as AttachKind, title: attMatch[2] } } : {}),
            hadImage: m.has_image,
            ...(url ? { imageUrl: url } : {}),
            strategyName: m.strategy_name ?? undefined,
          };
        })
      );
    },
    [supabase]
  );

  // Load the conversation list once. Every open starts on a fresh chat;
  // past conversations stay one click away in the history list.
  useEffect(() => {
    (async () => {
      // Full column set first; fall back to the 0009 columns if migration
      // 0011 (pinned/unread/archived) hasn't been applied yet. If even the
      // table is missing (pre-0009), stay usable as a session-only chat.
      let rows: Convo[] | null = null;
      const full = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at, pinned, unread, archived")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (!full.error && full.data) rows = full.data as Convo[];
      else {
        const basic = await supabase
          .from("ai_conversations")
          .select("id, title, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        if (!basic.error && basic.data) rows = basic.data as Convo[];
      }
      if (!rows) return;
      setConvos(rows);
    })();
  }, [supabase]);

  // Pinned chats first, then most recent; archived live behind a toggle.
  const visibleConvos = convos
    .filter((c) => !!c.archived === showArchived)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated_at.localeCompare(a.updated_at));
  const archivedCount = convos.filter((c) => c.archived).length;

  // Flag/title updates: local state first, then the row (fire-and-forget;
  // fails silently before migration 0011).
  function updateConvo(id: string, patch: Partial<Pick<Convo, "title" | "pinned" | "unread" | "archived">>) {
    setConvos((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    supabase
      .from("ai_conversations")
      .update(patch)
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("[sidekick] update conversation failed:", error.message);
      });
  }

  function toggleSelect(id: string, idx: number, shift: boolean) {
    setConfirmBulk(false);
    // Shift-click extends selection from the last-clicked row to this one.
    if (shift && lastIndexRef.current != null) {
      const lo = Math.min(lastIndexRef.current, idx);
      const hi = Math.max(lastIndexRef.current, idx);
      const rangeIds = visibleConvos.slice(lo, hi + 1).map((c) => c.id);
      setSelected((s) => {
        const n = new Set(s);
        rangeIds.forEach((r) => n.add(r));
        return n;
      });
      return;
    }
    lastIndexRef.current = idx;
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const allSelected = visibleConvos.length > 0 && visibleConvos.every((c) => selected.has(c.id));
  function toggleSelectAll() {
    setConfirmBulk(false);
    setSelected(allSelected ? new Set() : new Set(visibleConvos.map((c) => c.id)));
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmBulk(false);
  }
  // Archive (or unarchive, in the archived view) every ticked chat at once.
  async function bulkArchive() {
    const ids = [...selected];
    if (!ids.length) return;
    const archived = !showArchived;
    setConvos((cur) => cur.map((x) => (selected.has(x.id) ? { ...x, archived } : x)));
    setSelected(new Set());
    setConfirmBulk(false);
    await supabase.from("ai_conversations").update({ archived }).in("id", ids);
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirmBulk) {
      setConfirmBulk(true);
      return;
    }
    const removing = new Set(selected);
    setConvos((c) => c.filter((x) => !removing.has(x.id)));
    if (activeId && removing.has(activeId)) newChat();
    exitSelect();
    await supabase.from("ai_conversations").delete().in("id", ids);
  }

  function startRename(c: Convo) {
    setRenamingId(c.id);
    setRenameVal(c.title);
    setMenuId(null);
  }

  function commitRename() {
    if (renamingId && renameVal.trim()) updateConvo(renamingId, { title: renameVal.trim() });
    setRenamingId(null);
  }

  // Claude-style shortcuts while a conversation menu is open.
  useEffect(() => {
    if (!menuId) return;
    const onKey = (e: KeyboardEvent) => {
      const c = convos.find((x) => x.id === menuId);
      if (!c) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        setMenuId(null);
        setConfirmDeleteId(null);
      } else if (k === "p") {
        updateConvo(c.id, { pinned: !c.pinned });
        setMenuId(null);
      } else if (k === "u") {
        updateConvo(c.id, { unread: !c.unread });
        setMenuId(null);
      } else if (k === "r") {
        startRename(c);
      } else if (k === "a") {
        updateConvo(c.id, { archived: !c.archived });
        setMenuId(null);
      } else if (k === "d") {
        deleteConvo(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Slash commands: "/" opens the command menu; "/note q", "/strategy q",
  // "/analysis q" filter that kind's items by q. Lists are fetched lazily,
  // once per kind.
  const slashRaw = input.startsWith("/") ? input.slice(1) : null;
  const slashParts = slashRaw?.match(/^(\S*)(?:\s+(.*))?$/);
  const typedCmd = (slashParts?.[1] ?? "").toLowerCase();
  const exactCmd = SLASH_COMMANDS.find((c) => c.cmd === typedCmd)?.cmd ?? null;
  // Menu of commands while the word is still partial; options once complete.
  const cmdMenu =
    slashRaw !== null && !exactCmd
      ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(typedCmd) && slashParts?.[2] === undefined)
      : [];
  const slashQuery = exactCmd ? (slashParts?.[2] ?? "").trim() : null;
  const slashActive = slashRaw !== null && (exactCmd !== null || cmdMenu.length > 0);

  useEffect(() => {
    if (exactCmd === "note" && notesList === null) {
      (async () => {
        const { data } = await supabase
          .from("notes")
          .select("id, title, content, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        setNotesList((data as NoteRow[]) ?? []);
      })();
    }
    if (exactCmd === "analysis" && analysesList === null) {
      (async () => {
        const { data } = await supabase
          .from("chart_analyses")
          .select("id, symbol, timeframe, direction, notes, image_path, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        setAnalysesList((data as AnalysisRow[]) ?? []);
      })();
    }
  }, [exactCmd, notesList, analysesList, supabase]);

  const analysisTitle = (a: AnalysisRow) =>
    [a.symbol, a.timeframe, a.direction ? `(${a.direction})` : null].filter(Boolean).join(" ");

  const slashOptions: SlashOption[] = useMemo(() => {
    if (!exactCmd || slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    if (exactCmd === "note")
      return (notesList ?? [])
        .filter((n) => n.title.toLowerCase().includes(q))
        .slice(0, 8)
        .map((n) => ({ id: n.id, title: n.title, hint: n.updated_at.slice(0, 10) }));
    if (exactCmd === "strategy")
      return strategies
        .filter((s) => s.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((s) => ({ id: s.id, title: s.name, hint: "" }));
    return (analysesList ?? [])
      .filter((a) => analysisTitle(a).toLowerCase().includes(q))
      .slice(0, 8)
      .map((a) => ({ id: a.id, title: analysisTitle(a), hint: a.created_at.slice(0, 10) }));
  }, [exactCmd, slashQuery, notesList, strategies, analysesList]);

  const listLoading =
    (exactCmd === "note" && notesList === null) || (exactCmd === "analysis" && analysesList === null);

  function finishPick(kind: AttachKind, title: string, content: string) {
    setCtxAttach({ kind, title, content });
    setInput("");
    setSlashIndex(0);
    inputRef.current?.focus();
  }

  async function pickOption(opt: SlashOption) {
    if (!exactCmd) return;
    if (exactCmd === "note") {
      const n = notesList?.find((x) => x.id === opt.id);
      finishPick("note", opt.title, (n?.content ?? "").trim());
      return;
    }
    if (exactCmd === "analysis") {
      const a = analysesList?.find((x) => x.id === opt.id);
      finishPick("analysis", opt.title, (a?.notes ?? "").trim() || "(no text, screenshot-only entry)");
      // Attach the saved screenshot too, so Sidekick can actually see the
      // chart, not just the written notes. Falls back to text-only if the
      // image can't be loaded.
      if (a?.image_path) {
        try {
          const { data } = await supabase.storage.from(ANALYSIS_BUCKET).download(a.image_path);
          if (data) setAttach(await fileToImage(data));
        } catch (e) {
          console.warn("[sidekick] analysis screenshot load failed:", e);
        }
      }
      return;
    }
    // Strategy: pull its written rules so the conversation can quote them.
    finishPick("strategy", opt.title, "(loading rules…)");
    const lines = (table: string) =>
      supabase.from(table).select("content, sort_order").eq("strategy_id", opt.id).order("sort_order");
    const [row, entry, exit, rules] = await Promise.all([
      supabase
        .from("strategies")
        .select("plan_type, max_trades_per_day, max_daily_loss, max_daily_profit, risk_per_trade_pct, trading_window, trading_window_2, strategy_date, trading_notes")
        .eq("id", opt.id)
        .single(),
      lines("entry_criteria"),
      lines("exit_criteria"),
      lines("trade_management_rules"),
    ]);
    const s = (row.data ?? {}) as Record<string, unknown>;
    const list = (r: { data: unknown }) =>
      (((r as { data: { content: string }[] | null }).data ?? []).map((x) => `- ${x.content}`).join("\n")) || "- (none written)";
    const rc = [
      s.max_trades_per_day != null ? `max trades/day ${s.max_trades_per_day}` : null,
      s.max_daily_loss != null ? `max daily loss ${s.max_daily_loss}` : null,
      s.max_daily_profit != null ? `max daily profit ${s.max_daily_profit}` : null,
      s.risk_per_trade_pct != null ? `risk per trade ${s.risk_per_trade_pct}` : null,
      s.trading_window ? `trading window ${s.trading_window}` : null,
      s.trading_window_2 ? `second window ${s.trading_window_2}` : null,
      s.strategy_date ? `date ${s.strategy_date}` : null,
    ].filter(Boolean);
    const content = [
      s.plan_type ? `Plan type: ${s.plan_type}` : null,
      `Risk controls: ${rc.length ? rc.join(", ") : "(none set)"}`,
      `Entry criteria:\n${list(entry)}`,
      `Exit criteria:\n${list(exit)}`,
      `Trade management rules:\n${list(rules)}`,
      s.trading_notes ? `Notes: ${s.trading_notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    setCtxAttach((cur) =>
      cur && cur.kind === "strategy" && cur.title === opt.title ? { ...cur, content } : cur
    );
  }

  function newChat() {
    abortRef.current?.abort();
    // Unlock immediately; don't wait for the aborted request to unwind.
    busyRef.current = false;
    setBusy(false);
    setActiveId(null);
    setMessages([]);
    setConfirmDeleteId(null);
    inputRef.current?.focus();
  }

  async function deleteConvo(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    setMenuId(null);
    setConvos((c) => c.filter((x) => x.id !== id));
    if (activeId === id) newChat();
    await supabase.from("ai_conversations").delete().eq("id", id); // messages cascade
  }

  // Persistence helpers: history saving must never break the chat itself.
  async function ensureConversation(firstText: string): Promise<string | null> {
    if (activeId) return activeId;
    const title = firstText.slice(0, 60) || "New chat";
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ title })
      .select("id, title, updated_at")
      .single();
    if (error || !data) {
      if (error) console.warn("[sidekick] create conversation failed:", error.message);
      return null;
    }
    const convo = data as Convo;
    setActiveId(convo.id);
    setConvos((c) => [convo, ...c]);
    return convo.id;
  }

  async function saveMessage(conversationId: string | null, m: Msg) {
    if (!conversationId) {
      console.warn("[sidekick] no conversation id, message not saved:", m.role);
      return;
    }
    // Persist the chart screenshot to storage so it survives a reload (before
    // migration 0012 the image_path column is absent; the insert falls back).
    let imagePath: string | null = null;
    if (m.image) {
      try {
        const bytes = Uint8Array.from(atob(m.image.data), (ch) => ch.charCodeAt(0));
        const blob = new Blob([bytes], { type: m.image.mimeType });
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const ext = m.image.mimeType.includes("png") ? "png" : "jpg";
          const path = `${u.user.id}/sidekick/${uid()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(ANALYSIS_BUCKET)
            .upload(path, blob, { contentType: m.image.mimeType });
          if (upErr) console.warn("[sidekick] screenshot upload failed:", upErr.message);
          else imagePath = path;
        }
      } catch (e) {
        console.warn("[sidekick] screenshot encode/upload failed:", e);
      }
    }
    const base = {
      conversation_id: conversationId,
      role: m.role,
      // Attachment kind+title ride inside content as a parseable prefix
      // (no migration).
      content: m.att ? `[${m.att.kind}: ${m.att.title}] ${m.text}` : m.text,
      strategy_name: m.strategyName ?? null,
      has_image: !!(m.image || m.hadImage),
    };
    let { error } = await supabase
      .from("ai_messages")
      .insert((imagePath ? { ...base, image_path: imagePath } : base) as typeof base);
    // Column missing (migration 0012 not applied): retry without it.
    if (error && imagePath && /image_path|column/i.test(error.message)) {
      ({ error } = await supabase.from("ai_messages").insert(base));
    }
    if (error) console.warn(`[sidekick] save ${m.role} message failed:`, error.message);
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    setConvos((c) => {
      const hit = c.find((x) => x.id === conversationId);
      if (!hit) return c;
      return [{ ...hit, updated_at: new Date().toISOString() }, ...c.filter((x) => x.id !== conversationId)];
    });
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    // busyRef (not state) so two Enter presses in the same tick can't double-send.
    if ((!text && !attach && !ctxAttach) || busyRef.current) return;
    // Don't send a half-typed slash command as a message.
    if (slashActive) return;

    const userMsg: Msg = {
      role: "user",
      text:
        text ||
        (ctxAttach
          ? `Thoughts on this ${ctxAttach.kind}?`
          : "Check this setup against my rules."),
      ...(ctxAttach ? { att: { ...ctxAttach } } : {}),
      ...(attach
        ? {
            imageUrl: attach.previewUrl,
            image: { mimeType: attach.mimeType, data: attach.data },
            strategyName: strategies.find((s) => s.id === strategyId)?.name,
          }
        : {}),
    };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "model", text: "" }]);
    setInput("");
    const sentStrategyId = attach ? strategyId : "";
    setAttach(null);
    setCtxAttach(null);
    setBusy(true);
    busyRef.current = true;

    // Persist the user message in the background (failures never block chat).
    const convoIdPromise = ensureConversation(userMsg.text)
      .then(async (id) => {
        await saveMessage(id, userMsg);
        return id;
      })
      .catch(() => null);

    const update = (text: string, error = false) =>
      setMessages((cur) => {
        // This reply was cancelled (user switched chats / started a new one):
        // never write its text into whatever thread is showing now.
        if (ac.signal.aborted) return cur;
        // Replace the streaming placeholder; if anything replaced the thread
        // meanwhile, append instead of overwriting someone else's message.
        const next = [...cur];
        const last = next[next.length - 1];
        if (last && last.role === "model") next[next.length - 1] = { role: "model", text, error };
        else next.push({ role: "model", text, error });
        return next;
      });

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          strategyId: sentStrategyId || null,
          page: pathname,
          messages: history.map((m, i) => ({
            role: m.role,
            // Only the message being sent now carries image bytes / full
            // attachment text; older ones become one-line placeholders.
            text: (() => {
              let t = m.text;
              if (i === history.length - 1) {
                if (m.strategyName) t = `(setup check against strategy "${m.strategyName}") ${t}`;
                if (m.att?.content)
                  t = `(attached ${m.att.kind} "${m.att.title}")\n${m.att.content}\n(end of ${m.att.kind})\n\n${t}`;
              } else {
                if (m.imageUrl || m.hadImage)
                  t = `(a chart screenshot was attached here${m.strategyName ? `, checked against "${m.strategyName}"` : ""}) ${t}`;
                if (m.att) t = `(${m.att.kind} "${m.att.title}" was attached here) ${t}`;
              }
              return t;
            })(),
            ...(i === history.length - 1 && m.image ? { image: m.image } : {}),
          })),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        update(j?.error ?? `Something went wrong (${res.status}).`, true);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      // Watchdog: if no chunk arrives for 45s, treat the reply as finished
      // rather than hanging in "writing" forever on a stuck connection.
      const readWithTimeout = () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const t = setTimeout(() => resolve({ done: true, value: undefined }), 45_000);
          reader.read().then(
            (r) => { clearTimeout(t); resolve(r); },
            (e) => { clearTimeout(t); reject(e); }
          );
        });
      for (;;) {
        const { done, value } = await readWithTimeout();
        if (done) break;
        // Zero-width spaces are server heartbeats sent while the model is
        // still thinking; strip them from the visible text.
        acc += decoder.decode(value, { stream: true }).replaceAll("​", "");
        if (acc) update(acc);
      }
      reader.cancel().catch(() => {});
      if (!acc.trim()) update("I didn't get a response back. Try again.", true);
    } catch {
      // Aborted = user switched chats; anything else is a real failure.
      if (!ac.signal.aborted && !acc.trim()) {
        update("Couldn't reach Sidekick. Check your connection and try again.", true);
      }
    } finally {
      // Persist whatever text arrived, even if cancelled or timed out.
      if (acc.trim()) {
        convoIdPromise.then((id) => saveMessage(id, { role: "model", text: acc })).catch(() => {});
      }
      // Only unlock if this request is still the active one; a newer send
      // owns the busy state now and must not be unlocked from here.
      if (abortRef.current === ac) {
        abortRef.current = null;
        setBusy(false);
        busyRef.current = false;
      }
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setAttach(await fileToImage(file));
    inputRef.current?.focus();
  }

  function autogrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }

  return (
    <div className="flex h-full">
      {/* history panel (desktop) */}
      <aside className={compact ? "hidden" : "hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex"}>
        <div className="space-y-2 p-3">
          <button
            onClick={newChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border2 bg-card px-3 py-2 text-sm font-medium transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent2"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New chat
          </button>
          {selectMode ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5 text-xs">
                <button
                  onClick={toggleSelectAll}
                  title="Tip: shift-click a chat to select a range"
                  className="flex items-center gap-1.5 text-muted transition hover:text-foreground"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                      allSelected ? "border-accent bg-accent text-white" : "border-border2"
                    }`}
                  >
                    {allSelected && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-dim">{selected.size} selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={bulkArchive}
                  disabled={selected.size === 0}
                  className="flex-1 rounded-lg border border-border2 px-2 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40"
                >
                  {showArchived ? "Unarchive" : "Archive"}
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={selected.size === 0}
                  className="flex-1 rounded-lg border border-border2 px-2 py-1.5 text-xs font-medium text-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
                >
                  {confirmBulk ? "Sure?" : "Delete"}
                </button>
                <button
                  onClick={exitSelect}
                  className="rounded-lg px-2 py-1.5 text-xs text-dim transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            convos.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 text-xs text-dim transition hover:text-accent2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
                </svg>
                Select
              </button>
            )
          )}
        </div>
        {showArchived && (
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-dim">Archived</div>
        )}
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {visibleConvos.map((c, idx) => (
            <div
              key={c.id}
              className={`group relative flex items-center gap-1 rounded-lg px-1 transition ${
                c.id === activeId ? "bg-accent-soft" : "hover:bg-surface2"
              }`}
            >
              {selectMode ? (
                <button
                  onClick={(e) => toggleSelect(c.id, idx, e.shiftKey)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-[13px]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      selected.has(c.id) ? "border-accent bg-accent text-white" : "border-border2"
                    }`}
                  >
                    {selected.has(c.id) && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate text-muted">{c.title}</span>
                </button>
              ) : renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="jfield my-1 min-w-0 flex-1 !py-1.5 text-[13px]"
                  aria-label="Rename chat"
                />
              ) : (
                <button
                  onClick={() => loadConversation(c.id)}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left text-[13px] ${
                    c.id === activeId ? "text-accent2" : "text-muted"
                  }`}
                  title={c.title}
                >
                  {c.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  {c.pinned && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-dim" aria-label="Pinned">
                      <path d="M12 17v5M9 4h6l1 7 2 2H6l2-2 1-7z" />
                    </svg>
                  )}
                  <span className={`truncate ${c.unread ? "font-medium text-foreground" : ""}`}>{c.title}</span>
                </button>
              )}
              {!selectMode && (
                <button
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setMenuId(menuId === c.id ? null : c.id);
                  }}
                  aria-label={`Options for "${c.title}"`}
                  aria-expanded={menuId === c.id}
                  className={`shrink-0 rounded-md px-1 py-1 text-dim transition hover:bg-surface2 hover:text-foreground ${
                    menuId === c.id ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
              )}

              {!selectMode && menuId === c.id && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => {
                      setMenuId(null);
                      setConfirmDeleteId(null);
                    }}
                    aria-hidden="true"
                  />
                  <div
                    className={`absolute right-0 z-30 w-48 overflow-hidden rounded-xl border border-border2 bg-card py-1 shadow-2xl ${
                      idx >= visibleConvos.length - 2 ? "bottom-full mb-1" : "top-full"
                    }`}
                  >
                    <MenuItem
                      k="P"
                      label={c.pinned ? "Unpin" : "Pin"}
                      icon="M12 17v5M9 4h6l1 7 2 2H6l2-2 1-7z"
                      onClick={() => {
                        updateConvo(c.id, { pinned: !c.pinned });
                        setMenuId(null);
                      }}
                    />
                    <MenuItem
                      k="U"
                      label={c.unread ? "Mark as read" : "Mark as unread"}
                      icon="M3 3l18 18M10.5 5.2A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a13.4 13.4 0 0 1-1.7 2.6M6.6 6.6A13.2 13.2 0 0 0 2 12s3 7 10 7a9.9 9.9 0 0 0 5.4-1.6"
                      onClick={() => {
                        updateConvo(c.id, { unread: !c.unread });
                        setMenuId(null);
                      }}
                    />
                    <MenuItem
                      k="R"
                      label="Rename"
                      icon="M15.5 3.5a2.12 2.12 0 0 1 3 3L8 17l-4 1 1-4z"
                      onClick={() => startRename(c)}
                    />
                    <MenuItem
                      k="A"
                      label={c.archived ? "Unarchive" : "Archive"}
                      icon="M3 7h18M5 7l1 13h12l1-13M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                      onClick={() => {
                        updateConvo(c.id, { archived: !c.archived });
                        setMenuId(null);
                      }}
                    />
                    <div className="mx-2 my-1 border-t border-border" />
                    <MenuItem
                      k="D"
                      label={confirmDeleteId === c.id ? "Sure? Delete" : "Delete"}
                      icon="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"
                      danger
                      onClick={() => deleteConvo(c.id)}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
          {visibleConvos.length === 0 && (
            <p className="px-3 py-2 text-xs text-dim">{showArchived ? "Nothing archived." : "No saved chats yet."}</p>
          )}
        </div>
        {(archivedCount > 0 || showArchived) && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-left text-xs text-dim transition hover:text-foreground"
          >
            {showArchived ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back to chats
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h18M5 7l1 13h12l1-13M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                Archived ({archivedCount})
              </>
            )}
          </button>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* history picker (mobile / compact dock) */}
        <div className={`flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 ${compact ? "" : "md:hidden"}`}>
          <select
            value={activeId ?? ""}
            onChange={(e) => (e.target.value ? loadConversation(e.target.value) : newChat())}
            className="input min-w-0 flex-1 text-sm"
            aria-label="Chat history"
          >
            <option value="">New chat</option>
            {convos
              .filter((c) => !c.archived)
              .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated_at.localeCompare(a.updated_at))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.pinned ? "📌 " : ""}{c.title}
                </option>
              ))}
          </select>
          <button
            onClick={newChat}
            aria-label="New chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border2 text-muted transition hover:bg-surface2 hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        {/* thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="sk-in flex flex-row-reverse gap-3">
                  <div className="max-w-[85%] rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="Attached chart" className="mb-2 max-h-48 rounded-lg border border-border2" />
                    )}
                    {!m.imageUrl && m.hadImage && (
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border2 px-2.5 py-0.5 text-xs text-muted">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" /></svg>
                        chart screenshot
                      </div>
                    )}
                    {m.strategyName && (
                      <div className="mb-1.5 ml-1 inline-flex rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs text-accent2">
                        {m.strategyName}
                      </div>
                    )}
                    {m.att && (
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border2 px-2.5 py-0.5 text-xs text-muted">
                        <KindIcon kind={m.att.kind} />
                        {m.att.title}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className="sk-in flex gap-3">
                  <Avatar pulsing={busy && i === messages.length - 1} />
                  <div className="min-w-0 max-w-[85%]">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
                      Sidekick{busy && i === messages.length - 1 ? (m.text ? " · writing" : " · thinking") : " · AI"}
                    </div>
                    <div
                      className={`whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                        m.error
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : `border-border bg-card ${busy && i === messages.length - 1 ? "sk-bubble-live" : ""}`
                      }`}
                    >
                      {m.text || <TypingDots />}
                    </div>
                  </div>
                </div>
              )
            )}

            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent shadow-[0_4px_14px_rgba(106,88,240,0.35)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-display text-lg font-semibold">How can I help?</div>
                  <div className="mt-1 text-sm text-muted">I read your journal, strategies, notes and stats before every answer.</div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-border2 bg-card px-3.5 py-1.5 text-[13px] text-muted transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent2"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="shrink-0 border-t border-border bg-bg2 px-4 pb-3 pt-3 md:px-6">
          <div className="mx-auto max-w-3xl">
            {ctxAttach && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs text-accent2">
                  <KindIcon kind={ctxAttach.kind} />
                  {ctxAttach.title}
                  <button onClick={() => setCtxAttach(null)} aria-label="Remove attachment" className="ml-0.5 text-muted hover:text-danger">✕</button>
                </span>
                <span className="text-xs text-dim">
                  {ctxAttach.kind === "note" && "Note text goes to Sidekick with your message."}
                  {ctxAttach.kind === "strategy" && "The strategy's written rules go with your message."}
                  {ctxAttach.kind === "analysis" &&
                    (attach ? "The analysis text and its screenshot go with your message." : "The analysis text goes with your message.")}
                </span>
              </div>
            )}
            {attach && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attach.previewUrl} alt="Chart to check" className="h-11 w-16 rounded-lg border border-border2 object-cover" />
                  <button
                    onClick={() => setAttach(null)}
                    aria-label="Remove attachment"
                    className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
                <select
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value)}
                  className="input w-auto text-sm"
                  aria-label="Strategy to check against"
                >
                  <option value="">Check against strategy…</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-dim">Pick a strategy for a rule-by-rule check, or send as-is for a read.</span>
              </div>
            )}
            <div className="relative flex items-end gap-2 rounded-2xl border border-border2 bg-card p-1.5 transition focus-within:border-accent/60">
              {slashActive && (
                <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-sm overflow-hidden rounded-xl border border-border2 bg-card shadow-2xl">
                  {!exactCmd &&
                    cmdMenu.map((c, i) => (
                      <button
                        key={c.cmd}
                        onClick={() => {
                          setInput(`/${c.cmd} `);
                          setSlashIndex(0);
                          inputRef.current?.focus();
                        }}
                        onMouseEnter={() => setSlashIndex(i)}
                        className={`flex w-full items-baseline gap-3 px-3 py-2.5 text-left text-[13px] transition ${
                          i === slashIndex ? "bg-accent-soft" : "hover:bg-surface2"
                        }`}
                      >
                        <span className="font-mono text-accent2">/{c.cmd}</span>
                        <span className="text-muted">{c.desc}</span>
                      </button>
                    ))}
                  {exactCmd && listLoading && (
                    <div className="px-3 py-2.5 text-[13px] text-dim">Loading…</div>
                  )}
                  {exactCmd && !listLoading && slashOptions.length === 0 && (
                    <div className="px-3 py-2.5 text-[13px] text-dim">
                      {slashQuery ? `Nothing matches “${slashQuery}”.` : `Nothing to attach yet.`}
                    </div>
                  )}
                  {exactCmd &&
                    slashOptions.map((o, i) => (
                      <button
                        key={o.id}
                        onClick={() => pickOption(o)}
                        onMouseEnter={() => setSlashIndex(i)}
                        className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13px] transition ${
                          i === slashIndex ? "bg-accent-soft text-accent2" : "text-foreground hover:bg-surface2"
                        }`}
                      >
                        <span className="truncate">{o.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-dim">{o.hint}</span>
                      </button>
                    ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach chart screenshot"
                aria-label="Attach chart screenshot"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-foreground"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autogrow(e.target);
                }}
                onKeyDown={(e) => {
                  if (slashActive) {
                    const count = exactCmd ? slashOptions.length : cmdMenu.length;
                    if (e.key === "ArrowDown" && count) {
                      e.preventDefault();
                      setSlashIndex((i) => (i + 1) % count);
                      return;
                    }
                    if (e.key === "ArrowUp" && count) {
                      e.preventDefault();
                      setSlashIndex((i) => (i - 1 + count) % count);
                      return;
                    }
                    if ((e.key === "Enter" || e.key === "Tab") && count) {
                      e.preventDefault();
                      const idx = Math.min(slashIndex, count - 1);
                      if (exactCmd) pickOption(slashOptions[idx]);
                      else {
                        setInput(`/${cmdMenu[idx].cmd} `);
                        setSlashIndex(0);
                      }
                      return;
                    }
                    if (e.key === "Escape") {
                      setInput("");
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about your trading… ( / for commands )"
                className="max-h-[140px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-dim"
              />
              <button
                onClick={() => send()}
                disabled={busy || (!input.trim() && !attach && !ctxAttach) || slashActive}
                title="Send"
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_6px_16px_rgba(106,88,240,0.35)] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[11.5px] text-dim">
              Opinions with reasoning, never certainty. The trade and the risk stay yours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  label,
  k,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  k: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition hover:bg-surface2 ${
        danger ? "text-danger" : "text-foreground"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
        <path d={icon} />
      </svg>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-dim">{k}</span>
    </button>
  );
}

function Avatar({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent shadow-[0_4px_14px_rgba(106,88,240,0.35)] ${
        pulsing ? "sk-avatar-live" : ""
      }`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
      </svg>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1.5 py-1" aria-label="Sidekick is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-dim"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}
