# DSA Sheet Tracker

Full-stack DSA (Data Structures & Algorithms) problem tracker web application with Supabase backend. Dark-first responsive UI, multi-user via Google OAuth + PostgreSQL.

## What it is
- Tracks 518 LeetCode-style problems across 18 steps
- User accounts with Google OAuth login (Supabase Auth)
- Cloud database (Supabase PostgreSQL) stores progress, activity, profiles
- Dark-first responsive UI with light theme toggle
- Profile page with streak, heatmap, user info, backup export/import
- Single-user localStorage fallback preserved for UI preferences only

## Tech Stack
- Frontend: React 18.3.1 + Vite 5.4 + Tailwind CSS 3.4
- Backend: Supabase (PostgreSQL + Auth)
- Icons: lucide-react
- Data: src/data/sheet.json (518 problems, 18 steps)
- State hook: src/hooks/useProgress.js (uses progressRef for sync reads)

## Key Features
- Progress tracking per problem: todo → done / skipped; only increments on transition to done, decrements only on done → todo
- Daily streak counter with fire emoji; 52-week GitHub-style activity heatmap
- Filter system: All / Done / Skipped / To Do; hide skipped toggle; search by title
- Export/Import JSON backup format: `{ [problemTitle]: { id, state: "done"|"skipped"|"todo" } }`
- Reset progress button (stats row, not duplicate)
- Responsive layout: mobile sidebar toggle, overflow-y-auto scrollbars
- Profile page: full-page profile with info fields (name, email, bio, location, website), stats, streak, heatmap, backup controls
- Navigation: avatar click → profile; back button → tracker; settings/signout wired with alerts (pending real session clear)
- All progress/activity/user data saved to Supabase; UI state (expanded, filter, search, theme) in localStorage

## Project Structure
```
src/
  App.jsx              — Main app: navigation (showProfile), tracker sidebar, profile page, settings/signout buttons
  main.jsx             — React entry; imports index.css
  index.css            — Design tokens (dark root, light override), scrollbar styling (8px main purple, 6px activity-scroll purple), overflow-y-auto
  data/sheet.json      — 518 problems, 18 steps
  hooks/useProgress.js — progressRef sync access, bulkUpdate import, only increment/decrement on state transition
  lib/supabase.js      — Supabase client createClient (to be added)
.env                   — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (to be added)
```

## State Persistence
- Expanded/collapsed steps and subsections: localStorage (`expandedSteps`)
- Filter, hide skipped, search: localStorage (`filter`, `hideSkipped`, `searchQuery`)
- Progress, activity, daily streak, user info: Supabase PostgreSQL (`profiles`, `progress`, `activity_log` tables per plan)
- Theme: localStorage (`theme`) + `data-theme` attribute on `<html>`; dark first (`:root` dark tokens), light via media/query

## Navigation
- Main page (`showProfile` false): DSA tracker with sidebar (progress stats, streak, filter, search, reset button in stats row only)
- Profile page (`showProfile` true): Click avatar icon in header; full profile with user info, stats, heatmap, backup export/import
- Back button returns to tracker
- Settings and Sign out buttons wired; settings shows alert; sign out shows alert (real session clear pending Supabase auth implementation)

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
- `App.jsx` rebuilt clean from `.backup` after corruption; build passes with Vite

## Supabase Backend (Planned / In Progress)
- Auth: Google OAuth via Supabase Auth; `.env` holds URL + anon key
- Client initialization: `src/lib/supabase.js` exports `createClient(supabaseUrl, supabaseAnonKey)`
- Database schema (referenced in plan `i-want-to-make-quirky-lark.md`):
  - `profiles`: user info fields (id, name, email, bio, location, website, updated_at)
  - `progress`: problem states (user_id, problem_id, state: done/skipped/todo, updated_at)
  - `activity_log`: daily counts (user_id, date, count, updated_at)
  - `user_settings`: theme, expanded, filter preferences (optional)
- Auth guard: check Supabase session on load; redirect to login if none (pending implementation)
- Replace `useProgress` hook with Supabase `select`/`upsert` calls; keep `progressRef` for sync access during updates

## Build / Deploy
- `npm run dev` — Vite dev server; port 5173 default, tries 5174 if occupied (confirmed running at 5174)
- `npm run build` — production build; passes clean
- `.env` file must exist with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before backend integration
- No service worker or PWA; standard Vite SPA

## Plan Reference
- `/home/rehnx/.claude-omniroute/plans/i-want-to-make-quirky-lark.md` — Full backend conversion plan: Supabase Auth + DB, replace `useProgress`, auth guard, schema migrations
