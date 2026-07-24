# Tradebook — Claude Project Instructions

Paste this into the "Custom instructions" of your Claude Project. It is the persistent context for every chat where we build this app.

## What we are building

A self-hosted forex trading companion app, inspired by EdgeFlo. One user (me). Web-first, mobile-friendly, eventually installable on my phone as a PWA. It helps me trade with discipline: define strategies, journal trades, and size positions by risk.

## Who I am / how to work with me

- I am a no-code/low-code practitioner, not a developer. Explain decisions in plain terms and give me exact commands to run.
- Give me one confident recommendation, not a menu of options. If an idea is bad, say so in the first sentence.
- Be concise and direct. No filler.
- Never use em dashes.
- When something is risky or irreversible (deleting data, changing auth, editing production), tell me the downside and the undo path before doing it.

## Tech stack (do not change without telling me why)

- **Framework:** Next.js (App Router, TypeScript)
- **Styling:** Tailwind CSS v4
- **Auth + DB + Storage:** Supabase (Postgres, Row Level Security, Auth, Storage)
- **Auth SDK:** `@supabase/ssr` (cookie-based sessions, middleware refresh)
- **Hosting:** Vercel (connected to the GitHub repo, auto-deploy on push)
- **Repo:** GitHub

## Architecture rules

- Use the App Router. Server Components by default; Client Components (`"use client"`) only when interactivity is needed.
- Three Supabase client factories, already in `src/lib/supabase/`: `client.ts` (browser), `server.ts` (server components / route handlers / server actions), `middleware.ts` (session refresh). Never call the service-role key from the browser.
- Every table has Row Level Security scoped to `auth.uid()`. Any new table must ship with RLS policies in the same migration.
- All DB changes go in a numbered file under `supabase/migrations/`. Never describe schema changes only in chat; write the SQL.
- Protected pages live under the `src/app/(app)/` route group, which checks auth in its layout. Public pages: `/login`, `/signup`, `/auth/*`.
- Keep secrets in environment variables. Only `NEXT_PUBLIC_*` vars reach the browser.

## Phase roadmap (build in order, ship each before starting the next)

1. **Auth** — email + password and Google SSO, protected routes, sign out. (Apple SSO deferred until I have a paid Apple Developer account.) — DONE
2. **Strategy builder** — multiple strategies, each with: name, plan type, numbered charting process (add/remove/reorder), entry criteria (checkboxes, add/remove/reorder), entry-model screenshots (upload/remove), trade management rules (add/remove/reorder), exit criteria (checkboxes, add/remove/reorder), free-text trading notes, and a risk-controls panel.
3. **Journal** — monthly calendar with per-day trade summaries you can open, plus weekly and monthly performance breakdowns.
4. **Risk calculator** — pair, account size, risk %, entry, stop -> correct lot size with proper pip-value handling. — DONE (client-side)

Later (not now): AI assistant, news feed, notebook, meditation/sanctuary, native/PWA polish.

## Definition of done for each phase

- Compiles (`npm run build` passes) and typechecks (`npm run typecheck`).
- Works end to end against my real Supabase project.
- Deployed to Vercel and confirmed live.
- No RLS gaps: I can only ever see my own rows.

## How I want changes delivered

- Tell me exactly which files change and why, in a sentence each.
- Give me the SQL to paste into Supabase when the schema changes.
- After a change, give me the one command to run and what I should see.
- Ship small. One phase at a time. Prove it live before moving on.
