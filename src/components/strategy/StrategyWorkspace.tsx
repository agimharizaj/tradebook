"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePairs } from "@/lib/usePairs";

type ListItem = { key: string; id?: string; text: string; checked: boolean };
type ImgItem = { key: string; path: string; url: string };

type Draft = {
  id: string | null;
  name: string;
  plan_type: string;
  // undefined until migration 0006 adds the column; saves only send it when set
  pair?: string;
  charting: ListItem[];
  entry: ListItem[];
  rules: ListItem[];
  exit: ListItem[];
  notes: string;
  models: ImgItem[];
  maxTrades: string;
  maxLoss: string;
  maxProfit: string;
  riskPct: string;
  window: string;
};

type StrategyRow = { id: string; name: string; plan_type: string | null };

const BUCKET = "entry-models";
const uid = () => Math.random().toString(36).slice(2, 10);

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    plan_type: "",
    pair: "",
    charting: [],
    entry: [],
    rules: [],
    exit: [],
    notes: "",
    models: [],
    maxTrades: "",
    maxLoss: "",
    maxProfit: "",
    riskPct: "",
    window: "",
  };
}

export default function StrategyWorkspace() {
  const supabase = createClient();
  const watchlist = usePairs();
  const [list, setList] = useState<StrategyRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Unsaved-edit guard: clicking another plan (or +New) with unsaved changes
  // prompts to save or discard instead of silently dropping the draft.
  const dirtyEdit = useRef(false);
  const [pendingNav, setPendingNav] = useState<{ kind: "open"; id: string } | { kind: "new" } | null>(null);

  const loadList = useCallback(async () => {
    const { data } = await supabase
      .from("strategies")
      .select("id, name, plan_type")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setList((data as StrategyRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function openStrategy(id: string) {
    if (mode === "edit" && dirtyEdit.current && draft) {
      setPendingNav({ kind: "open", id });
      return;
    }
    dirtyEdit.current = false;
    setStatus(null);
    const { data: s } = await supabase
      .from("strategies")
      .select("*")
      .eq("id", id)
      .single();
    if (!s) return;

    const load = (table: string) =>
      supabase
        .from(table)
        .select("*")
        .eq("strategy_id", id)
        .order("sort_order", { ascending: true });

    const [charting, entry, rules, exit, models] = await Promise.all([
      load("charting_steps"),
      load("entry_criteria"),
      load("trade_management_rules"),
      load("exit_criteria"),
      load("entry_models"),
    ]);

    const toItems = (rows: unknown[]): ListItem[] =>
      (rows as { id: string; content: string; is_checked?: boolean }[]).map(
        (r) => ({
          key: uid(),
          id: r.id,
          text: r.content,
          checked: !!r.is_checked,
        })
      );

    const modelRows = (models.data as { image_path: string }[]) ?? [];
    const signed = await Promise.all(
      modelRows.map((m) =>
        supabase.storage.from(BUCKET).createSignedUrl(m.image_path, 3600)
      )
    );

    setDraft({
      id: s.id,
      name: s.name ?? "",
      plan_type: s.plan_type ?? "",
      pair: "pair" in s ? ((s.pair as string | null) ?? "") : undefined,
      charting: toItems(charting.data ?? []),
      entry: toItems(entry.data ?? []),
      rules: toItems(rules.data ?? []),
      exit: toItems(exit.data ?? []),
      notes: s.trading_notes ?? "",
      models: modelRows.map((m, i) => ({
        key: uid(),
        path: m.image_path,
        url: signed[i]?.data?.signedUrl ?? "",
      })),
      maxTrades: s.max_trades_per_day?.toString() ?? "",
      maxLoss: s.max_daily_loss?.toString() ?? "",
      maxProfit: s.max_daily_profit?.toString() ?? "",
      riskPct: s.risk_per_trade_pct?.toString() ?? "",
      window: s.trading_window ?? "",
    });
    setMode("view");
  }

  function newStrategy() {
    if (mode === "edit" && dirtyEdit.current && draft) {
      setPendingNav({ kind: "new" });
      return;
    }
    dirtyEdit.current = false;
    setStatus(null);
    setDraft({ ...emptyDraft(), name: `Strategy ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` });
    setMode("edit");
  }

  function patch(p: Partial<Draft>) {
    if (mode === "edit") dirtyEdit.current = true;
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  type Sec = "charting" | "entry" | "rules" | "exit";
  function updateSec(sec: Sec, fn: (arr: ListItem[]) => ListItem[]) {
    if (mode === "edit") dirtyEdit.current = true;
    setDraft((d) => (d ? { ...d, [sec]: fn(d[sec]) } : d));
  }
  function addItem(sec: Sec) {
    updateSec(sec, (arr) => [...arr, { key: uid(), text: "", checked: false }]);
  }
  function updateItem(sec: Sec, key: string, text: string) {
    updateSec(sec, (arr) => arr.map((i) => (i.key === key ? { ...i, text } : i)));
  }
  function toggleItem(sec: Sec, key: string) {
    updateSec(sec, (arr) =>
      arr.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i))
    );
  }
  function removeItem(sec: Sec, key: string) {
    updateSec(sec, (arr) => arr.filter((i) => i.key !== key));
  }
  async function toggleViewCheck(sec: "entry" | "exit", key: string) {
    if (!draft) return;
    const item = draft[sec].find((i) => i.key === key);
    if (!item) return;
    const newChecked = !item.checked;
    updateSec(sec, (arr) =>
      arr.map((i) => (i.key === key ? { ...i, checked: newChecked } : i))
    );
    if (item.id) {
      const table = sec === "entry" ? "entry_criteria" : "exit_criteria";
      await supabase.from(table).update({ is_checked: newChecked }).eq("id", item.id);
    }
  }
  function reorder(sec: Sec, from: number, to: number) {
    updateSec(sec, (arr) => {
      if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
        return arr;
      }
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!draft) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const path = `${u.user.id}/${uid()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) {
      setStatus(`Upload failed: ${error.message}`);
      return;
    }
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    patch({
      models: [
        ...draft.models,
        { key: uid(), path, url: signed?.signedUrl ?? "" },
      ],
    });
  }

  async function removeImage(key: string, path: string) {
    if (!draft) return;
    await supabase.storage.from(BUCKET).remove([path]);
    patch({ models: draft.models.filter((m) => m.key !== key) });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) {
      setStatus("Not signed in.");
      setSaving(false);
      return;
    }

    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const row = {
      user_id: userId,
      name: draft.name || "Untitled",
      plan_type: draft.plan_type || null,
      ...(draft.pair !== undefined ? { pair: draft.pair || null } : {}),
      trading_notes: draft.notes || null,
      max_trades_per_day: num(draft.maxTrades),
      max_daily_loss: num(draft.maxLoss),
      max_daily_profit: num(draft.maxProfit),
      risk_per_trade_pct: num(draft.riskPct),
      trading_window: draft.window || null,
    };

    let sid = draft.id;
    if (sid) {
      const { error } = await supabase.from("strategies").update(row).eq("id", sid);
      if (error) return fail(error.message);
    } else {
      const { data, error } = await supabase
        .from("strategies")
        .insert(row)
        .select("id")
        .single();
      if (error || !data) return fail(error?.message ?? "Insert failed");
      sid = data.id;
    }

    const writeChildren = async (
      table: string,
      items: ListItem[],
      withCheck: boolean
    ) => {
      await supabase.from(table).delete().eq("strategy_id", sid);
      const rows = items
        .filter((i) => i.text.trim() !== "")
        .map((i, idx) => ({
          strategy_id: sid,
          user_id: userId,
          content: i.text.trim(),
          sort_order: idx,
          ...(withCheck ? { is_checked: i.checked } : {}),
        }));
      if (rows.length) await supabase.from(table).insert(rows);
    };

    await writeChildren("charting_steps", draft.charting, false);
    await writeChildren("entry_criteria", draft.entry, true);
    await writeChildren("trade_management_rules", draft.rules, false);
    await writeChildren("exit_criteria", draft.exit, true);

    await supabase.from("entry_models").delete().eq("strategy_id", sid);
    if (draft.models.length) {
      await supabase.from("entry_models").insert(
        draft.models.map((m, idx) => ({
          strategy_id: sid,
          user_id: userId,
          image_path: m.path,
          sort_order: idx,
        }))
      );
    }

    setSaving(false);
    dirtyEdit.current = false;
    if (sid) await openStrategy(sid);
    setStatus("Saved.");
    loadList();
    return true;

    function fail(msg: string) {
      setStatus(`Save failed: ${msg}`);
      setSaving(false);
      return false;
    }
  }

  async function performDelete() {
    setConfirmDelete(false);
    if (!draft?.id) {
      setDraft(null);
      return;
    }
    await supabase.from("strategies").delete().eq("id", draft.id);
    setDraft(null);
    loadList();
  }

  return (
    <div className="flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start overflow-y-auto border-r border-border p-4 md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-dim">
            My plans
          </span>
          <button
            onClick={newStrategy}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
          >
            + New
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">No plans yet. Create one.</p>
        ) : (
          <div className="space-y-1">
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => openStrategy(s.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  draft?.id === s.id
                    ? "bg-accent-soft text-accent2"
                    : "text-muted hover:bg-surface2 hover:text-foreground"
                }`}
              >
                <div className="font-medium">{s.name}</div>
                {s.plan_type && (
                  <div className="text-xs text-dim">{s.plan_type}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
          <button
            onClick={newStrategy}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            + New
          </button>
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => openStrategy(s.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition ${
                draft?.id === s.id
                  ? "border-accent bg-accent-soft text-accent2"
                  : "border-border2 text-muted"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!draft ? (
          <div className="mx-auto max-w-2xl pt-4 md:pt-16 md:text-center">
            <h1 className="text-2xl">Strategy</h1>
            <p className="mt-2 text-muted">
              Build and refine your trading playbooks. Pick a plan or create a
              new one.
            </p>
            <button
              onClick={newStrategy}
              className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              + New plan
            </button>
            {list.length > 0 && (
              <div className="mt-6 space-y-2 md:hidden">
                {list.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openStrategy(s.id)}
                    className="block w-full rounded-lg border border-border2 px-4 py-3 text-left text-sm text-foreground transition hover:border-accent"
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.plan_type && (
                      <span className="block text-xs text-dim">{s.plan_type}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : mode === "view" ? (
          <StrategyView
            draft={draft}
            onEdit={() => setMode("edit")}
            onDelete={() => setConfirmDelete(true)}
            onToggle={toggleViewCheck}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                onFocus={(e) => {
                  if (draft.name === "New strategy" || draft.name.startsWith("Strategy ")) e.target.select();
                }}
                placeholder="Strategy name"
                className="w-full border-none bg-transparent text-2xl font-semibold outline-none placeholder:text-dim"
                style={{ fontFamily: "var(--font-display)" }}
              />
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => {
                    dirtyEdit.current = false;
                    if (draft.id) openStrategy(draft.id);
                    else setDraft(null);
                  }}
                  className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-danger hover:text-danger"
                >
                  Delete
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            {status && (
              <p
                className={`text-sm ${
                  status.startsWith("Saved") ? "text-success" : "text-danger"
                }`}
              >
                {status}
              </p>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Section label="Plan type">
                <input
                  value={draft.plan_type}
                  onChange={(e) => patch({ plan_type: e.target.value })}
                  placeholder="e.g. Liquidity sweep, break and retest"
                  className="field"
                />
              </Section>
              <Section label="Pair">
                <select
                  value={draft.pair ?? ""}
                  onChange={(e) => patch({ pair: e.target.value })}
                  className="field"
                >
                  <option value="">No pair</option>
                  {watchlist.map((pr) => (<option key={pr} value={pr}>{pr}</option>))}
                  {draft.pair && !watchlist.includes(draft.pair) && (
                    <option value={draft.pair}>{draft.pair}</option>
                  )}
                </select>
                <span className="mt-1 block text-xs">
                  <Link href="/profile#pairs" className="text-accent2 hover:underline">Edit pairs</Link>
                </span>
              </Section>
            </div>

            <OrderedList
              title="Charting process"
              numbered
              items={draft.charting}
              onAdd={() => addItem("charting")}
              onText={(k, t) => updateItem("charting", k, t)}
              onRemove={(k) => removeItem("charting", k)}
              onReorder={(from, to) => reorder("charting", from, to)}
              placeholder="e.g. Mark HTF range and liquidity"
            />

            <OrderedList
              title="Entry criteria"
              checkboxes
              items={draft.entry}
              onAdd={() => addItem("entry")}
              onText={(k, t) => updateItem("entry", k, t)}
              onToggle={(k) => toggleItem("entry", k)}
              onRemove={(k) => removeItem("entry", k)}
              onReorder={(from, to) => reorder("entry", from, to)}
              placeholder="e.g. Bias alignment"
            />

            <Section label="Entry models (screenshots)">
              <div className="flex flex-wrap gap-3">
                {draft.models.map((m) => (
                  <div
                    key={m.key}
                    className="group relative h-28 w-40 overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt="entry model"
                      className="h-full w-full object-cover"
                    />
                    {/* Always visible on touch; hover-reveal only on desktop */}
                    <button
                      onClick={() => removeImage(m.key, m.path)}
                      className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-xs text-white transition md:opacity-0 md:group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <label className="flex h-28 w-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border2 text-sm text-muted transition hover:border-accent hover:text-accent2">
                  + Add image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </Section>

            <OrderedList
              title="Trade management rules"
              items={draft.rules}
              onAdd={() => addItem("rules")}
              onText={(k, t) => updateItem("rules", k, t)}
              onRemove={(k) => removeItem("rules", k)}
              onReorder={(from, to) => reorder("rules", from, to)}
              placeholder="e.g. Set and forget, no resizing mid-trade"
            />

            <OrderedList
              title="Exit criteria"
              checkboxes
              items={draft.exit}
              onAdd={() => addItem("exit")}
              onText={(k, t) => updateItem("exit", k, t)}
              onToggle={(k) => toggleItem("exit", k)}
              onRemove={(k) => removeItem("exit", k)}
              onReorder={(from, to) => reorder("exit", from, to)}
              placeholder="e.g. Close at opposing liquidity"
            />

            <Section label="Trading notes">
              <textarea
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                rows={4}
                placeholder="Why this works, common mistakes, reminders under pressure"
                className="field resize-y"
              />
            </Section>

            <Section label="Risk controls">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Num label="Max trades / day" v={draft.maxTrades} on={(v) => patch({ maxTrades: v })} />
                <Num label="Max daily loss" v={draft.maxLoss} on={(v) => patch({ maxLoss: v })} />
                <Num label="Max daily profit" v={draft.maxProfit} on={(v) => patch({ maxProfit: v })} />
                <Num label="Risk per trade %" v={draft.riskPct} on={(v) => patch({ riskPct: v })} />
                <label className="block">
                  <span className="mb-1 block text-xs text-dim">Trading window</span>
                  <input
                    value={draft.window}
                    onChange={(e) => patch({ window: e.target.value })}
                    placeholder="08:00-17:00 UTC"
                    className="field"
                  />
                </label>
              </div>
            </Section>
          </div>
        )}
      </main>

      {pendingNav && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h2 className="text-lg">Save changes?</h2>
            <p className="mt-2 text-sm text-muted">
              You have unsaved edits to &ldquo;{draft?.name || "this plan"}&rdquo;.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingNav(null)}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground"
              >
                Keep editing
              </button>
              <button
                onClick={() => {
                  const nav = pendingNav;
                  setPendingNav(null);
                  dirtyEdit.current = false;
                  if (nav.kind === "open") openStrategy(nav.id);
                  else newStrategy();
                }}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-danger transition hover:border-danger"
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  const nav = pendingNav;
                  setPendingNav(null);
                  const ok = await save();
                  if (!ok) return;
                  if (nav.kind === "open") openStrategy(nav.id);
                  else newStrategy();
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 ring-1 ring-border2">
            <h2 className="text-lg">Delete strategy?</h2>
            <p className="mt-2 text-sm text-muted">
              &ldquo;{draft?.name || "This plan"}&rdquo; and all its steps,
              criteria, notes, and screenshots will be permanently removed. This
              cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={performDelete}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function Num({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      <input
        type="number"
        value={v}
        onChange={(e) => on(e.target.value)}
        className="field"
        style={{ fontFamily: "var(--font-mono)" }}
      />
    </label>
  );
}

function StrategyView({
  draft,
  onEdit,
  onDelete,
  onToggle,
}: {
  draft: Draft;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (sec: "entry" | "exit", key: string) => void;
}) {
  const charting = draft.charting.filter((i) => i.text.trim());
  const entry = draft.entry.filter((i) => i.text.trim());
  const rules = draft.rules.filter((i) => i.text.trim());
  const exit = draft.exit.filter((i) => i.text.trim());
  const risk = [
    ["Max trades / day", draft.maxTrades],
    ["Max daily loss", draft.maxLoss],
    ["Max daily profit", draft.maxProfit],
    ["Risk per trade %", draft.riskPct],
    ["Trading window", draft.window],
  ].filter(([, v]) => v && v.toString().trim());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">{draft.name || "Untitled"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {draft.pair && (
              <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-xs text-accent2">{draft.pair}</span>
            )}
            {draft.plan_type && <span className="text-muted">{draft.plan_type}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onDelete}
            className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-danger hover:text-danger"
          >
            Delete
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_240px]">
        <div className="space-y-8">
          {charting.length > 0 && (
            <ViewBlock title="Charting process">
              <ol className="space-y-2">
                {charting.map((it, i) => (
                  <li key={it.key} className="flex gap-3 text-sm">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs text-accent2"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{it.text}</span>
                  </li>
                ))}
              </ol>
            </ViewBlock>
          )}

          {entry.length > 0 && (
            <ViewBlock title="Entry criteria">
              <ViewChecks items={entry} sec="entry" onToggle={onToggle} />
            </ViewBlock>
          )}

          {draft.models.length > 0 && (
            <ViewBlock title="Entry models">
              <div className="flex flex-wrap gap-3">
                {draft.models.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.key}
                    src={m.url}
                    alt="entry model"
                    className="h-28 w-40 rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            </ViewBlock>
          )}

          {rules.length > 0 && (
            <ViewBlock title="Trade management rules">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {rules.map((it) => (
                  <li key={it.key}>{it.text}</li>
                ))}
              </ul>
            </ViewBlock>
          )}

          {exit.length > 0 && (
            <ViewBlock title="Exit criteria">
              <ViewChecks items={exit} sec="exit" onToggle={onToggle} />
            </ViewBlock>
          )}

          {draft.notes.trim() && (
            <ViewBlock title="Trading notes">
              <p className="whitespace-pre-wrap text-sm text-muted">{draft.notes}</p>
            </ViewBlock>
          )}
        </div>

        <div>
          {risk.length > 0 && (
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                Risk controls
              </div>
              <div className="space-y-2">
                {risk.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-dim">{k}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function ViewChecks({
  items,
  sec,
  onToggle,
}: {
  items: ListItem[];
  sec: "entry" | "exit";
  onToggle: (sec: "entry" | "exit", key: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onToggle(sec, it.key)}
          className="flex w-full items-center gap-2.5 text-left text-sm"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
              it.checked
                ? "border-success bg-success text-background"
                : "border-border2 hover:border-accent"
            }`}
          >
            {it.checked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            )}
          </span>
          <span className={it.checked ? "" : "text-muted"}>{it.text}</span>
        </button>
      ))}
    </div>
  );
}

function OrderedList({
  title,
  items,
  onAdd,
  onText,
  onToggle,
  onRemove,
  onReorder,
  placeholder,
  numbered,
  checkboxes,
}: {
  title: string;
  items: ListItem[];
  onAdd: () => void;
  onText: (key: string, text: string) => void;
  onToggle?: (key: string) => void;
  onRemove: (key: string) => void;
  onReorder: (from: number, to: number) => void;
  placeholder: string;
  numbered?: boolean;
  checkboxes?: boolean;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {title}
        </span>
        <button onClick={onAdd} className="text-xs font-medium text-accent2 hover:underline">
          + Add
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-dim">Nothing yet. Click add.</p>
        )}
        {items.map((it, idx) => (
          <div
            key={it.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIdx !== idx) setOverIdx(idx);
            }}
            onDrop={() => {
              if (dragIdx !== null) onReorder(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            className={`flex items-center gap-2 rounded-lg transition ${
              overIdx === idx && dragIdx !== null
                ? "ring-1 ring-accent"
                : ""
            } ${dragIdx === idx ? "opacity-40" : ""}`}
          >
            {/* Desktop: drag handle. Touch: HTML5 drag never fires on iOS, so
                phones get explicit up/down buttons instead. */}
            <span
              draggable
              onDragStart={(e) => {
                setDragIdx(idx);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              className="hidden shrink-0 cursor-grab select-none px-1.5 text-dim hover:text-foreground active:cursor-grabbing md:inline"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              ⋮⋮
            </span>
            <span className="flex shrink-0 flex-col md:hidden">
              <button
                onClick={() => onReorder(idx, idx - 1)}
                disabled={idx === 0}
                className="px-2 py-0.5 text-xs text-dim disabled:opacity-30"
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => onReorder(idx, idx + 1)}
                disabled={idx === items.length - 1}
                className="px-2 py-0.5 text-xs text-dim disabled:opacity-30"
                aria-label="Move down"
              >
                ▼
              </button>
            </span>
            {numbered && (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent-soft bg-accent-soft text-xs text-accent2"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {idx + 1}
              </span>
            )}
            {checkboxes && (
              <input
                type="checkbox"
                checked={it.checked}
                onChange={() => onToggle?.(it.key)}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
            )}
            <input
              value={it.text}
              onChange={(e) => onText(it.key, e.target.value)}
              placeholder={placeholder}
              className="field"
            />
            <button
              onClick={() => onRemove(it.key)}
              className="shrink-0 rounded-md p-2 text-sm text-dim hover:text-danger"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
