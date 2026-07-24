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
- Accents: violet `#7C6CFF` (primary/brand, `#AB9DFF` lighter), teal-green `#22D39A` (profit/positive), red `#FF6274` (loss/negative), gold `#F3C57C` (premium highlight).
- Rationale: leading trading UIs avoid pure black (halation, eye strain over long sessions) and use a deep blue-slate base with a clear elevation ladder, one accent, off-white text. See research in git history / brand concept.
- Feel: institutional trading terminal, flat surfaces, subtle glow only on primary actions, numbers always monospace. No busy gradients on content, no clutter.

## Current status

- Phase 1 (auth): DONE. Email + password and Google SSO, protected shell, sign out.
- Phase 2 (strategy builder): DONE. `/strategy` with read-only view + Edit mode, drag-reorder, checkboxes tickable in view, entry-model screenshot upload, risk controls, delete confirm modal.
- Phase 3 (journal): DONE. `/journal` monthly calendar, per-day trade add/list/delete modal, monthly + weekly summaries.
- Phase 4 (risk calculator): DONE. `/risk` with 3 modes (segmented switcher) and live FX via `/api/fx` (Frankfurter/ECB, keyless) auto-filling pair price + conversion rate. Gold (XAU) stays manual.
- Dashboard: real stats pulled from trades.
- Profile: `/profile` display name, password change (current+new) in a separate Security section.
- Layout: collapsible sidebar (state in localStorage), viewport-pinned; content scrolls inside.
- Database: full schema + RLS for all phases in `supabase/migrations/0001_init.sql`.
- Deploy: not yet pushed to GitHub/Vercel. Runs locally against real Supabase.
- TODO: signup form should prompt for display name.

## Phase roadmap (build in order, ship each before the next)

1. Auth — DONE.
2. Strategy builder — multiple strategies, each with: name, plan type, numbered charting process (add/remove/reorder), entry criteria (checkboxes, add/remove/reorder), entry-model screenshots (upload/remove via the `entry-models` storage bucket), trade management rules (add/remove/reorder), exit criteria (checkboxes, add/remove/reorder), free-text notes, and the risk-controls panel.
3. Journal — monthly calendar with per-day trade summaries you can open, plus weekly and monthly breakdowns.
4. Risk calculator — DONE.

Later, not now: AI assistant, news feed, notebook, meditation/sanctuary, PWA polish.

## Definition of done per phase

`npm run build` and `npm run typecheck` pass; works end to end against my real Supabase project; deployed to Vercel and confirmed live; no RLS gaps (I only ever see my own rows).

## First-run commands

```bash
cp .env.local.example .env.local   # then fill in Supabase URL + anon key
npm install
npm run dev                         # http://localhost:3000
```

Full setup and deploy steps are in `README.md`. Paste `claude-project-instructions.md` into a claude.ai Project if you want to build there too.
