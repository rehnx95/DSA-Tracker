# DSA Sheet Tracker

Full-stack DSA (Data Structures & Algorithms) problem tracker web application with Supabase backend. Dark-first responsive UI, multi-user via Google OAuth + PostgreSQL.

## What it is
- Tracks 518 LeetCode-style problems across 18 steps
- Supports multiple problem sheets, selectable from the collapsible sheets sidebar
- Users can upload `.txt` sheets; the browser converts them and stores them privately in Supabase
- User accounts with Google OAuth login (Supabase Auth)
- Cloud database (Supabase PostgreSQL) stores progress, activity, profiles
- Dark-first responsive UI with light theme toggle
- Profile page with streak, heatmap, user info, backup export/import
- Progress, activity, and profile records are isolated by Supabase Auth user ID; UI preferences remain local

## Tech Stack
- Frontend: React 18.3.1 + Vite 5.4 + Tailwind CSS 3.4
- Backend: Supabase (PostgreSQL + Auth)
- Icons: lucide-react
- Data: src/data/sheet.json (518 problems, 18 steps)
- State hook: src/hooks/useProgress.js (loads and saves each authenticated user's data to Supabase)

## Key Features
- Progress tracking per problem: todo → done / skipped; solved dates are stored in the user's local calendar and activity counts follow that date
- Current and longest daily streaks; year-view contribution heatmap with weekday/month alignment and daily solved counts
- Filter system: All / Done / Skipped / To Do; hide skipped toggle; search by title
- Export/Import JSON backup format: `{ [problemTitle]: { id, state: "done"|"skipped"|"todo" } }`
- Reset progress button (stats row, not duplicate)
- Responsive layout: mobile sidebar toggle, overflow-y-auto scrollbars
- Profile page: full-page profile with editable name, username, location, and website settings; stats, streak, heatmap, and backup controls
- Navigation: avatar click → profile; back button → tracker; sign out clears the Supabase session
- All progress/activity/user data saved to Supabase; UI state (expanded, filter, search, theme) in localStorage

## Project Structure
```
src/
  App.jsx              — Main app: navigation (showProfile), tracker sidebar, profile page, settings/signout buttons
  main.jsx             — React entry; imports index.css
  index.css            — Design tokens (dark root, light override), scrollbar styling (8px main purple, 6px activity-scroll purple), overflow-y-auto
  data/*.json          — converted problem sheets (one JSON file per source sheet)
  hooks/useProgress.js — per-user Supabase sync, progressRef state access, bulk backup import
  lib/supabase.js      — Supabase client and configuration guard
.env                   — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

## State Persistence
- Expanded/collapsed steps and subsections: localStorage (`expandedSteps`)
- Filter, hide skipped, search: localStorage (`filter`, `hideSkipped`, `searchQuery`)
- Progress, activity, daily streak, and user profile: Supabase PostgreSQL (`profiles`, `progress`, `activity_log`)
- Theme: localStorage (`theme`) + `data-theme` attribute on `<html>`; dark first (`:root` dark tokens), light via media/query

## Navigation
- Main page (`showProfile` false): DSA tracker with sidebar (progress stats, streak, filter, search, reset button in stats row only)
- Profile page (`showProfile` true): Click avatar icon in header; full profile with user info, stats, heatmap, backup export/import
- Back button returns to tracker
- Sign out clears the Supabase session

## Design / UI Details
- Dark-first token system: `:root` defines dark palette, `prefers-color-scheme: light` and `[data-theme="light"]` override to light
- Custom scrollbars: `::-webkit-scrollbar` 8px track purple-900/50, thumb purple-500 rounded-full; `.activity-scroll::-webkit-scrollbar` 6px for activity list
- Scrollbar visibility: `overflow-y-auto` with `max-h-[calc(100vh-...)]` prevents overflow clipping; `min-width: 0` on text containers prevents horizontal scroll
- Profile navigation: avatar click toggles `showProfile` state in App.jsx; profile renders `ProfilePage` component full-width

## Code Internals
- `useProgress` hook returns `{ progress, setProgress, doneCount, totalCount, ... }`
- `progressRef` holds current progress object for synchronous reads during state updates; fixes double-count in activity tracking
- Activity tracking rules: increment only on `todo` → `done`; decrement only on `done` → `todo`; skipped changes do not affect count
- Backup import: reads JSON file, calls `bulkUpdate` to apply `{title: {id, state}}` format; export writes same format
- Built-in sheet conversion: developers can add a `.txt` source under `source/`, run `npm run convert-sheet`, and check in the generated JSON under `src/data/`.
- User-uploaded sheets: signed-in users open the sheets sidebar and select **Upload a TXT sheet**. The sidebar offers a downloadable sample TXT template. The app converts the TXT in the browser and stores the resulting data in `user_sheets`; each account can only read its own uploaded sheets. The SQL migration must be applied to the Supabase project first. Uploads accept files up to 2 MB, with `Step 1 — Title` headings and sequential numbered problem lines (optional `(LC 123)` and `(Skip)` markers are supported).
- `App.jsx` rebuilt clean from `.backup` after corruption; build passes with Vite

## Supabase Backend
- Auth: Google OAuth via Supabase Auth; the app restores the session and loads the matching profile before showing the tracker.
- Database: `profiles`, `progress`, and `activity_log` are scoped to the signed-in user's ID. First-time users complete onboarding before entering the tracker.
- Latest schema migrations: `supabase/migrations/20261020165100_multi_user_auth_profiles.sql`, `supabase/migrations/20261020170900_activity_calendar_streaks.sql`, `supabase/migrations/20261020174800_decouple_auth_signup_from_user_settings.sql`, `supabase/migrations/20261020175400_remove_bio_signup_dependency.sql`, and `supabase/migrations/20261021003000_user_uploaded_sheets.sql`. They are additive; the user-sheets migration creates private per-account storage protected by row-level security.
- The browser uses only the Supabase project URL and public anon key. Never put a service-role key in frontend environment variables.

### Google sign-in setup
1. In Supabase, enable the Google provider under **Authentication → Sign In / Providers** and configure the OAuth client ID and secret from your Google Cloud OAuth credentials.
2. Add the Supabase callback URL shown in the provider settings to the Google OAuth client's authorized redirect URIs.
3. In **Authentication → URL Configuration**, set the production site URL and allow the local development URL (for example `http://localhost:5173`) and every deployed app origin.
4. Apply all SQL migrations in the Supabase SQL Editor (or through the project's migration workflow), including the user-uploaded-sheets migration.
5. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the local `.env` and deployment environment, then restart/redeploy the frontend.

## Build / Deploy
- `npm run dev` — Vite dev server; port 5173 default, tries 5174 if occupied (confirmed running at 5174)
- `npm run build` — production build; passes clean
- `.env` file must contain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; these variables are also required in the deployment environment
- No service worker or PWA; standard Vite SPA

## Plan Reference
- `/home/rehnx/.claude-omniroute/plans/i-want-to-make-quirky-lark.md` — Full backend conversion plan: Supabase Auth + DB, replace `useProgress`, auth guard, schema migrations
