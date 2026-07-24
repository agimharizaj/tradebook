# Tradebook

A self-hosted forex trading companion (strategies, journal, risk sizing) built with Next.js + Supabase, deployed on Vercel. Inspired by EdgeFlo.

## What works today (Phase 1 + 4)

- Sign up / log in with email + password, or Google SSO
- Protected app shell with sidebar navigation
- Risk & position-size calculator (correct pip-value handling)
- Full database schema + Row Level Security for every phase (strategies, journal)

Phase 2 (strategy builder) and Phase 3 (journal calendar) have their pages stubbed and their database tables ready.

## Tech stack

Next.js (App Router, TypeScript) - Tailwind CSS v4 - Supabase (Auth, Postgres, Storage) - Vercel.

---

## Setup, step by step

You need a free account on: Supabase, GitHub, Vercel. Google SSO also needs a Google Cloud project (free).

### 1. Create the Supabase project

1. Go to supabase.com, create a new project. Pick a region near you. Save the database password.
2. Open **Project Settings -> API** and copy:
   - Project URL
   - `anon` `public` key
3. Open the **SQL Editor**, paste the entire contents of `supabase/migrations/0001_init.sql`, and run it. This creates all tables, security policies, and the screenshot storage bucket.

### 2. Configure environment variables locally

1. Copy `.env.local.example` to `.env.local`.
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
   - `NEXT_PUBLIC_SITE_URL` = `http://localhost:3000`

### 3. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. You should be redirected to `/login`. Create an account with email + password and you land on the dashboard.

> Email confirmation: by default Supabase requires email confirmation. For a single-user app you can turn this off under **Authentication -> Sign In / Providers -> Email -> Confirm email** while testing.

### 4. Enable Google SSO (optional but recommended)

1. In **Google Cloud Console**, create OAuth credentials (Web application). Add these Authorized redirect URIs:
   - `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`
2. In Supabase, **Authentication -> Sign In / Providers -> Google**, paste the Client ID and Client Secret, enable it.
3. That is all. The "Continue with Google" button already works.

### 5. Push to GitHub

```bash
git init
git add .
git commit -m "Tradebook: phase 1 auth + phase 4 risk calculator"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/tradebook.git
git push -u origin main
```

### 6. Deploy to Vercel

1. On vercel.com, **Add New -> Project**, import the GitHub repo.
2. Add the environment variables from `.env.local`, but set `NEXT_PUBLIC_SITE_URL` to your Vercel URL (e.g. `https://tradebook.vercel.app`).
3. Deploy.
4. In Supabase **Authentication -> URL Configuration**, add your Vercel URL to **Site URL** and **Redirect URLs** (`https://tradebook.vercel.app/auth/callback`). In Google Cloud, the Supabase callback URL stays the same.

Every `git push` to `main` now auto-deploys.

---

## Project structure

```
src/
  app/
    page.tsx                 # redirects to /dashboard or /login
    login/, signup/          # auth pages
    auth/callback/           # OAuth + email confirm handler
    auth/signout/            # sign out
    (app)/                   # protected route group (auth checked in layout)
      dashboard/
      strategy/              # Phase 2 (stub)
      journal/               # Phase 3 (stub)
      risk/                  # Phase 4 (done)
  components/                # Sidebar, AuthForm
  lib/supabase/              # browser / server / middleware clients
middleware.ts                # session refresh + route guard
supabase/migrations/         # database schema + RLS
```

## Next steps

Build Phase 2 (strategy builder), then Phase 3 (journal calendar). The tables already exist. See `claude-project-instructions.md` for how to drive the build.
