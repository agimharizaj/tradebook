# Tradebook — project memory

This file is read automatically by Claude Code and Cowork when this folder is opened. It is the single source of truth for how to work on this project. Keep it updated as the build progresses.

## Product

Tradebook is a self-hosted trading companion for one user (Gimi). It brings strategy playbooks, a trade journal, and a risk/position-size engine into one dark, terminal-grade web app. Inspired by EdgeFlo but market-agnostic. Web-first, mobile-friendly, eventually a phone-installable PWA.

## How to work with me (Gimi)

- I am a no-code/low-code practitioner, not a developer. Give exact commands and explain decisions plainly.
- One confident recommendation, not a menu. If an idea is bad, say so in the first sentence.
- Concise and direct. Never use em dashes.
- Before anything risky or irreversible (deleting data, changing auth, editing production), state the downside and the undo path first.
- I am happy to run things in the terminal via Claude Code as well as in Cowork.

## Stack (do not change without a stated reason)

- Next.js (App Router, TypeScript)
- Tailwind CSS v4
- Supabase: Auth, Postgres, Storage. Sessions via `@supabase/ssr` (cookie-based, refreshed in middleware).
- Hosting: Vercel, auto-deploy on push to `main`.
- Repo: GitHub.

## Architecture rules

- App Router. Server Components by default; `"use client"` only when interactivity is needed.
- Supabase clients live in `src/lib/supabase/`: `client.ts` (browser), `server.ts` (server), `middleware.ts` (session refresh). Never expose the service-role key to the browser.
- Every table has Row Level Security scoped to `auth.uid()`. Any new table ships with its RLS policies in the same migration.
- All schema changes go in a numbered file under `supabase/migrations/`. Never describe schema only in chat; write the SQL.
- Protected pages live under `src/app/(app)/` (auth checked in its layout). Public: `/login`, `/signup`, `/auth/*`.
- Only `NEXT_PUBLIC_*` env vars reach the browser.

## Brand and visual direction

The approved look is the dark "terminal" concept in `design/tradebook-brand-concept.html`. The current app pages still use a plain light theme and must be migrated to this system.

- Fonts: Space Grotesk (display/headings), Inter (body/UI), JetBrains Mono (all numbers).
- Core colors (lifted blue-charcoal ladder, never pure black): sidebar/page `#161A23`, app content canvas `#1C212C`, cards `#222834`, inputs/hover `#2B3240`, borders `rgba(255,255,255,.08)` and `.15`. Text `#E7E9EF`, muted `#9AA0B0`, dim `#757C8E`. Elevation ascends: sidebar < content < card < input.
- Accents: violet `#6A58F0` (primary/brand, chosen so white button text passes WCAG AA at 4.9:1; `#AB9DFF` lighter for text accents), teal-green `#22D39A` (profit/positive), red `#FF6274` (loss/negative), gold `#F3C57C` (premium highlight). Dim text is `#939AAD` (AA on all surfaces); do not darken either without rechecking contrast.
- Rationale: leading trading UIs avoid pure black (halation, eye strain over long sessions) and use a deep blue-slate base with a clear elevation ladder, one accent, off-white text. See research in git history / brand concept.
- Feel: institutional trading terminal, flat surfaces, subtle glow only on primary actions, numbers always monospace. No busy gradients on content, no clutter.

## Current status

- Phase 1 (auth): DONE. Email + password and Google SSO, protected shell, sign out.
- Phase 2 (strategy builder): DONE. `/strategy` with read-only view + Edit mode, drag-reorder, checkboxes tickable in view, entry-model screenshot upload, risk controls, delete confirm modal.
- Phase 3 (journal): DONE. `/journal` monthly calendar, per-day trade add/list/delete modal, monthly + weekly summaries.
- Phase 4 (risk calculator): DONE. `/risk` with 3 modes (segmented switcher) and live prices via `/api/fx` (Frankfurter/ECB for fiat, CoinGecko for BTC, gold-api.com for XAU, all keyless). Pure sizing math lives in `src/lib/risk.ts` (lot output floors to 0.01 steps). Changing pair clears entry/SL/lots and prefills entry with the live price.
- Dashboard: real stats pulled from trades, incl. profit factor, equity curve, max drawdown. Read errors surface as a banner.
- Undo: BlockEditor has Cmd+Z / Cmd+Shift+Z whole-list snapshot history (typing grouped ~1s, native textarea undo overridden). Note/strategy deletes soft-delete with a 5s "Deleted - Undo" toast; the DB row is removed only when the toast expires or on unmount (finalizePendingDelete). Backspace/Delete opens the confirm dialog (Enter confirms, Escape cancels) outside text fields.
- Dashboard is stats + charts only (nav link cards removed); checked strategy entry/exit criteria render struck through.
- Journal: true expectancy (win% x avg win - loss% x avg loss) plus separate Avg R; two-step delete confirmation; MT5 import keeps close time and stores commission+swap in `trades.commission` (pnl stays net).
- Profile: `/profile` display name, password change (current+new) in a separate Security section. Signup collects first/last name.
- Layout: collapsible sidebar (state in localStorage), viewport-pinned; content scrolls inside. Pinch zoom enabled (no maximumScale).
- Database: schema + RLS in `supabase/migrations/` (0001 init, 0002 import ext_id, 0003 notes, 0004 traded_on -> timestamptz + commission, 0005 chart_analyses, 0006 pair tags on notes/strategies (strategy pair UI later removed; column kept), 0007 news_items headline archive, 0008 chart_analyses.extra_images, 0009 ai chat history). Apply 0004 before MT5 import, 0006 before pair tags, 0007 before the news archive fills.
- Pairs: master catalog in `src/lib/pairs.ts` (FX, metals, crypto, indices, energy); the user watchlist lives in auth metadata `pairs`, managed at Profile -> Trading pairs (`/profile/pairs`), read via `usePairs()`. It drives every pair dropdown (charts, risk, journal, analysis log, note tags; strategy pair tag removed from UI, DB column kept). Add new instruments to the catalog only; sizing conventions live in `src/lib/risk.ts` (XAG 0.01/5000oz, crypto pip 1 contract 1 = coins; indices/energy not sizable). `/api/fx` covers fiat (Frankfurter), metals (gold-api), crypto (CoinGecko id map).
- Security: password minimum is 10 in the client; ALSO raise it in Supabase dashboard (Auth -> Passwords, still default 6) and enable leaked-password protection.
- Accessibility: form labels and primary buttons pass WCAG AA (see brand section); avoid reintroducing `#757C8E` text or `maximumScale: 1`. Light theme (`html[data-theme="light"]` in `globals.css`) is also AA-tuned: dim `#646B7E`, success `#087A52`, danger `#C92F35`, gold `#9A650F`; page bg darker than cards for elevation. Recheck contrast before changing any of these.
- Shared form input CSS (`.field`/`.input`/`.jfield`) lives in `globals.css`, not per-component style tags.
- Sidekick (AI assistant): `/sidekick` chat over the user's own data via Gemini (`gemini-3.6-flash`, free-tier key in `GEMINI_API_KEY`, server-side only). `/api/ai` streams plain text; per request it rebuilds a compact context (`src/lib/ai-context.ts`: aggregates, breach days, strategies with criteria/risk controls, last 50 trades, last 10 notes full text (capped 1.2k chars) + last 10 chart-analysis entries) with the signed-in user's Supabase client so RLS applies. Setup checker: attach a chart screenshot + pick a strategy; the system prompt hard-blocks signals/predictions and forces rule-by-rule compliance opinions only. On Gemini 429 the route falls back to a free OpenRouter model (text only, `OPENROUTER_API_KEY`, live free-model list cached 1h, prefers Qwen/GLM/Kimi). Chat history persists in `ai_conversations`/`ai_messages` (migration 0009, RLS, screenshots stored as a has_image flag only); conversation list panel with New chat + two-step delete; /note command in the composer attaches a notebook note (content sent with the message, title stored as a [note: X] prefix in ai_messages.content). Floating dock (`SidekickDock` in the app layout) opens a compact Sidekick drawer on every page except /sidekick. Concept mock: `design/tradebook-assistant-concept.html`.
- Deploy: pushed to GitHub (`agimharizaj/tradebook`), auto-deploys to Vercel on push to `main`.
- Industry benchmark: `industry-standards-review.md` (July 2026). Deferred from its list: StrategyWorkspace split, per-trade screenshots, multi-tag setups, time-of-day reports, service worker.

## Phase roadmap (build in order, ship each before the next)

1. Auth — DONE.
2. Strategy builder — multiple strategies, each with: name, plan type, numbered charting process (add/remove/reorder), entry criteria (checkboxes, add/remove/reorder), entry-model screenshots (upload/remove via the `entry-models` storage bucket), trade management rules (add/remove/reorder), exit criteria (checkboxes, add/remove/reorder), free-text notes, and the risk-controls panel.
3. Journal — monthly calendar with per-day trade summaries you can open, plus weekly and monthly breakdowns.
4. Risk calculator — DONE.

Done beyond the core four: PWA (installable, manifest + icons), responsive mobile layout with bottom tab nav, Charts (TradingView embed with drawing tools) at `/charts`, Notebook (notes CRUD, autosave) at `/notebook` (table in `0003_notes.sql`), News (TradingView market-news timeline + economic calendar) at `/news`, Sanctuary (box-breathing + psychology prompts) at `/sanctuary`. Profile moved to the sidebar footer.

Done beyond that: Sidekick, the AI assistant, at `/sidekick` (see Current status).

Later, not now: live broker sync (MetaApi), placing trades from the chart, richer note formatting.

## Definition of done per phase

`npm run build` and `npm run typecheck` pass; works end to end against my real Supabase project; deployed to Vercel and confirmed live; no RLS gaps (I only ever see my own rows).

## First-run commands

```bash
cp .env.local.example .env.local   # then fill in Supabase URL + anon key
npm install
npm run dev                         # http://localhost:3000
```

Full setup and deploy steps are in `README.md`. Paste `claude-project-instructions.md` into a claude.ai Project if you want to build there too.
