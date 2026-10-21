# Track Sheet — Architecture and Operations

Track Sheet is a multi-user DSA problem-sheet tracker. Users authenticate with
Google through Supabase, choose built-in sheets or upload private TXT sheets,
track problem states, and share a public-facing profile with other signed-in
users.

This document describes the current implementation and its operating
requirements. It is intended to give an engineer enough context to maintain,
deploy, or extend the application without first tracing every component.

## 1. System at a glance

```text
Browser
  React 18 SPA (Vite)
    ├─ Supabase Auth: Google OAuth session
    ├─ Supabase PostgREST: own profile, progress, activity, uploaded sheets
    ├─ Supabase RPC: username search and authenticated public profiles
    └─ Vercel Function /api/search
         └─ validates caller's bearer token, invokes search RPC

Vercel
  ├─ serves Vite production output from dist/
  ├─ rewrites SPA routes to index.html
  └─ runs api/search.js as a serverless function

Supabase
  ├─ Auth users and OAuth provider configuration
  ├─ PostgreSQL tables protected by row-level security
  └─ SECURITY DEFINER RPCs for carefully scoped cross-user discovery
```

The browser uses the public Supabase anon/publishable key. User access is
authorized by the signed-in Supabase session and database policies; no
service-role key belongs in the frontend or Vercel environment.

## 2. Repository map

| Path | Responsibility |
| --- | --- |
| `index.html` | HTML shell, browser title/description, font loading, React root |
| `src/main.jsx` | React entry point, global stylesheet import, Supabase global, render error boundary |
| `src/App.jsx` | Authentication state machine, onboarding, tracker, search routes, owner/public profiles, sheet upload and backup UI |
| `src/index.css` | Main design tokens, dark/light theme variables, global and component styling |
| `src/App.css` | Additional/older styling; inspect actual imports before assuming it affects the running app |
| `src/hooks/useProgress.js` | Active per-user progress/activity state, persistence, reset and theme state |
| `src/hooks/useSupabaseProgress.js` | Older/legacy progress hook; the active app imports `useProgress.js` |
| `src/components/ProfileSettings.jsx` | Edit the signed-in user's name, username, location and website |
| `src/components/Onboarding.jsx` | Older onboarding implementation; `App.jsx` currently contains and renders its own `OnboardingPage` |
| `src/lib/supabase.js` | Creates the browser Supabase client from Vite environment variables |
| `src/utils/parseSheet.js` | Browser parser and sample TXT template for uploaded sheets |
| `src/data/*.json` | Built-in sheet data imported by filename at build time |
| `source/*.txt` | Source text files used to generate built-in JSON sheets |
| `scripts/convert-sheet.cjs` | Converts a selected source TXT file into `src/data/<name>.json` |
| `api/search.js` | Authenticated username-prefix search Vercel Function |
| `supabase/migrations/*.sql` | Ordered database schema, security policies and RPC definitions |
| `vercel.json` | Rewrite rule for client-side navigation and direct SPA URLs |
| `architecture.md` | This architecture and deployment reference |

The npm package is still internally named `dsa-sheet-tracker`; the product
branding shown to users is **Track Sheet**. Renaming the npm package is not
needed for the application to function.

## 3. Runtime and authentication

### Application startup

1. `src/main.jsx` mounts `App` inside an error boundary.
2. `App` checks that the Supabase URL and anon key are configured.
3. Supabase Auth restores a persisted session. The app subscribes to auth-state
   changes and records the authenticated Supabase user.
4. For an authenticated user, `App` loads that user's profile row by `auth.uid`
   equivalent (`profiles.id = user.id`).
5. `onboarding_completed` selects the next screen:
   - false or missing profile: onboarding;
   - true: authenticated tracker.
6. The tracker calls `useProgress(user)` to load that user's progress and
   activity. Uploaded sheets are fetched separately from `user_sheets`.

The application state machine in `App.jsx` uses `LOADING`,
`UNAUTHENTICATED`, `ONBOARDING`, and `AUTHENTICATED`. Search and public-profile
pages are rendered inside the authenticated app; public profile URLs are not
anonymous/public-to-the-internet endpoints.

### Google OAuth

The browser starts OAuth with the Supabase Google provider and redirects back
to the current site origin. Configuration is split between:

- Google Cloud OAuth client: authorized JavaScript origins for production and
  any intended preview origins; authorized redirect URI is the Supabase
  callback URL.
- Supabase Auth provider: Google client ID and secret.
- Supabase Auth URL configuration: production Site URL and allowed app return
  URLs.

The OAuth secret is configured in Supabase, never in frontend variables.

### User profile and onboarding

The active onboarding page is embedded in `src/App.jsx`. It gathers the
display name and unique username; location and website are optional. Usernames
are normalized to lowercase and must use letters, numbers, and hyphens.
`profiles.onboarding_completed` controls whether onboarding is required.

`src/components/ProfileSettings.jsx` edits the same public-facing profile
fields after onboarding. It saves to the user's own `profiles` row and returns
the saved row to the parent app.

## 4. Application routes and navigation

Routing is lightweight client-side state/history handling in `src/App.jsx`;
the application does not use React Router.

| URL | View | Access |
| --- | --- | --- |
| `/` | Tracker (or sign-in/onboarding depending on auth state) | Signed-in tracker |
| `/people` | Username search | Signed-in users |
| `/user/:username` | Shareable public profile view | Signed-in users |
| `/u/:username` | Legacy alias for the same profile view | Signed-in users |

`getPeopleRoute()` parses `/people`, `/user/...`, and `/u/...`; navigation
updates browser history and the `popstate` listener keeps the view in sync with
back/forward navigation. `vercel.json` rewrites requests to the SPA entry so
direct opens and refreshes can load these routes. The Vercel function at
`/api/search` remains a function route, not a client-side page.

## 5. Problem sheets and identifiers

### Built-in sheets

At build time, `src/App.jsx` uses `import.meta.glob("./data/*.json", ...)` to
load every valid JSON sheet. The filename without `.json` is the sheet ID and
normally also supplies its title:

- `src/data/dsa.json` → ID `dsa`, title `DSA`;
- `src/data/backend.json` → ID `backend`, title `Backend`.

The DSA sheet intentionally uses unprefixed problem IDs for compatibility with
existing records. Other built-in sheet problem IDs are stored as
`<sheet-id>::<problem-id>`. The selected built-in sheet is chosen from the
browser's `dsa-active-sheet` localStorage value when valid; otherwise the
default sheet ID is `dsa`.

### Built-in sheet authoring

1. Add or update a TXT source in `source/`.
2. Run `npm run convert-sheet` and choose the matching source filename (or pass
   the source name as an argument).
3. Review the generated JSON under `src/data/`.
4. Commit both the source and generated JSON so the Vite build includes it.

The built-in converter lives in `scripts/convert-sheet.cjs`. It is separate
from the browser parser used for user uploads.

### User-uploaded sheets

An authenticated user chooses **Upload a TXT sheet** in the sheets sidebar.
The browser:

1. checks the `.txt` extension and a 2 MB size limit;
2. parses the file using `src/utils/parseSheet.js`;
3. derives a display title from the filename;
4. inserts the converted sheet into `user_sheets`;
5. adds it to the current session's sheet list.

The supported format uses `Step N — Title` headings, optional subsection
headings such as `1.1 — Title`, and sequential numbered problem lines. Optional
markers include `(LC 123)` and `(Skip)`. `src/utils/parseSheet.js` also exports
the sample TXT template and problem-count helper.

Custom sheet problem IDs are namespaced as
`custom-<user_sheets UUID>::<problem-id>`. Custom sheets are private to their
owner and are not returned as raw JSON by public profile RPCs. The RPC returns
only sheet title/count summaries and a small Recent AC list.

### Progress state and backup format

Each problem's persisted state is `done` or `skipped`; an absent progress row
means `todo`, except built-in problems with `defaultSkip: true`, which default
to skipped. The state is stored per account and problem ID.

Profile backup export/import operates on one selected sheet at a time. Its JSON
shape is:

```json
{
  "Problem title": {
    "id": "problem-id-or-namespaced-id",
    "state": "done"
  }
}
```

Import validates IDs against the selected sheet before writing. Reset can
remove one sheet's progress or all progress and activity for the signed-in
account.

## 6. Persistence and synchronization

### Source-of-truth responsibilities

| Data | Storage | Scope |
| --- | --- | --- |
| Login/session | Supabase Auth | Account |
| Name, username, location, website, onboarding status | `profiles` | One profile row per Auth user |
| Problem state and completion timestamps | `progress` | Auth user + problem ID |
| Activity counts by date | `activity_log` | Auth user + date |
| Uploaded sheet title, source filename and parsed content | `user_sheets` | Auth user |
| Theme, selected sheet, filter, search, expanded rows | Browser localStorage | Browser/device |

The `user_settings` table is retained in the schema for compatibility but the
current tracker stores these UI preferences in localStorage.

### Progress writes

`src/hooks/useProgress.js` loads progress and activity rows for the signed-in
user. `update()` and `bulkUpdate()` optimistically update React state, then
serialize database writes through a promise queue. A transition into `done`
records `completed_on` in the user's local calendar and an ISO `updated_at`.
Changes to solved state adjust the corresponding `activity_log` date count.
Skipped states do not count as activity. Reset removes progress and adjusts or
clears activity as appropriate.

On save failures, the hook logs the database error and sets a user-visible sync
error. The UI is not an offline-first queue: pending edits are not guaranteed
to survive reloads before the write succeeds.

### Activity heatmap and date handling

The owner profile currently builds its heatmap, current streak, longest streak,
and yearly totals from the loaded `activity_log`. The public-profile RPC
derives activity and streak dates from solved rows in `progress`, using
`completed_on` when present and a UTC `updated_at` date fallback for older
rows. The public profile passes the browser's local date to the RPC and refreshes
while open (every 15 seconds, and on window focus).

These are separate read paths: owner profile uses persisted activity-log
counts, while public profile derives activity from progress rows. If the
activity log drifts, owner and public heatmaps can differ; use progress
completion dates as the canonical source when reconciling such a discrepancy.
The `20261020170900_activity_calendar_streaks.sql` migration backfills
completion dates and rebuilds activity counts for existing records.

## 7. Database model and access control

The schema is created and evolved by timestamped SQL migrations in
`supabase/migrations/`. Apply every migration in timestamp order to a new
project; for an existing project, apply any migrations it has not yet received.

### Main tables

#### `profiles`

- `id`: UUID referencing `auth.users.id`, primary key.
- `name`, `username`, `location`, `website`: user-managed profile details.
- `bio`: legacy nullable/retained field; current profile UI does not collect or
  display it.
- `onboarding_completed`, `updated_at`.
- Username uniqueness is case-insensitive; search has a lower-case prefix
  index.

An Auth trigger creates a minimally populated profile with a generated
username; the user completes onboarding to claim their desired username.

#### `progress`

- `user_id`: owning profile/Auth user.
- `problem_id`: built-in or namespaced custom sheet problem ID.
- `state`: `todo`, `done`, or `skipped` (the client usually represents todo by
  absence of a row).
- `completed_on`: local calendar date when marked done; null when not done.
- `updated_at`.
- Primary key: `(user_id, problem_id)`.

#### `activity_log`

- `user_id`, `date`, `count`, `updated_at`.
- Primary key: `(user_id, date)`.
- Maintained by the client as solved problem transitions occur; rebuilt from
  progress rows during the activity-date migration.

#### `user_sheets`

- `id`, `user_id`, `title`, `source_name`, `sheet_data` JSONB, `created_at`.
- RLS permits authenticated users to read and insert only their own sheets.
- No public table grant is used to expose sheet contents to profile viewers.

#### `user_settings`

Legacy per-user preferences table with RLS. Current code uses localStorage for
theme and tracker UI preferences instead.

### Row-level security and RPC boundary

RLS is enabled on account-owned tables. Direct table access is scoped to the
authenticated owner. Cross-user search/profile reads are implemented through
`SECURITY DEFINER` SQL functions with a fixed `search_path`, explicit
authenticated-only execution grants, onboarding-complete profile filtering,
and a response limited to public-facing fields.

Current public RPC contracts after all migrations:

- `search_public_profiles(search_term TEXT)` returns `name` and `username` for
  at most five username-prefix matches. It validates a 3–48 character
  alphanumeric/hyphen prefix.
- `get_public_profile(requested_username TEXT, requested_today DATE)` returns
  public identity fields, solved total, date/count activity map, streak values,
  non-custom `done`/`skipped` progress entries, custom sheet summaries, and
  up to eight custom-sheet Recent AC entries.

The profile RPC excludes email, auth IDs, credentials, private UI settings,
custom sheet UUIDs, todo rows, and raw custom sheet data. Built-in problem IDs
are included because the public UI needs them to map solved/skipped progress
to the checked-in built-in sheet titles. Do not widen this RPC casually:
review every added field for privacy and keep uploaded sheet data private.

## 8. Search and public profile data flow

### Username autocomplete

1. `/people` requires a signed-in user.
2. After at least three input characters, the browser obtains the current
   Supabase access token.
3. It sends `GET /api/search?q=<prefix>` with a bearer authorization header.
4. `api/search.js` accepts GET only, validates the prefix, validates the token
   with Supabase Auth, then invokes `search_public_profiles`.
5. The function returns at most five `{ name, username }` results and sets
   private/no-store cache headers.
6. Selecting a result navigates to `/user/<username>`.

The endpoint uses the anon key together with the verified caller's token; it
does not use a service-role key.

### Profile view

The public profile page invokes `get_public_profile` and renders profile
identity, streak cards, built-in and custom sheet progress, activity heatmap,
and Recent AC. It uses the same built-in JSON data bundled into the app to map
public progress IDs to sheet totals and problem titles. The owner-only
Progress & Data Management panel is not shown.

Search and profile loading errors are explicitly displayed. A missing username
renders a not-found state. The SQL function only returns onboarding-complete
profiles and requires `auth.uid()` to be present.

## 9. Frontend state and design

`src/App.jsx` currently contains both the top-level authentication state
machine and most tracker/profile UI. `ProfileSettings` is extracted; the
onboarding view and profile display remain embedded.

The app defaults to the dark theme. `useProgress` persists theme to
localStorage and applies/removes `data-theme="light"` on the document root.
`src/index.css` defines global CSS variables and theme overrides; many
components also use explicit Tailwind color classes. A visual theme change may
therefore require checking both the CSS variables and component utility
classes.

The profile display includes public profile identity, current/best streaks,
per-sheet progress, heatmap/active-day count, and Recent AC. The signed-in
owner's profile additionally shows email and Progress & Data Management
controls. Account email is not returned by the public profile RPC.

`src/main.jsx` wraps the React app with an error boundary. A render exception
shows a reload fallback and is logged to the browser console.

## 10. Environment and configuration

### Frontend build/runtime

Required Vite environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

They are read by `src/lib/supabase.js` and compiled into the frontend as
project URL and public anon/publishable key. Never set a service-role secret as
a `VITE_` variable.

### Vercel Function

`api/search.js` accepts:

- `SUPABASE_URL` (falls back to `VITE_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (falls back to `VITE_SUPABASE_ANON_KEY`)

Configure these for the Vercel Function using the same public project URL and
anon/publishable key. Do not configure the service-role key for search.

### Google and Supabase

Configure the Google provider in Supabase Auth, set the Supabase callback URI
in Google Cloud, and configure production/preview redirect origins in Supabase
Auth URL settings. These dashboards are part of the application setup and are
not represented by repository files.

## 11. Local development, data updates, and deployment

### Local development

```sh
npm install
npm run dev
```

Create a local `.env` with the two required `VITE_` variables. `.env` is
ignored by Git and must not be committed.

### Build and preview

```sh
npm run build
npm run preview
```

The production build is emitted into `dist/`. `npm run convert-sheet` is the
separate built-in sheet generation command.

### Vercel production

1. Import the repository with the repository root as project root.
2. Use `npm run build` and `dist` as the output directory.
3. Set frontend and Function environment variables described above.
4. Configure Google OAuth and Supabase allowed return URLs for the deployed
   origin.
5. Apply the SQL migrations in timestamp order.
6. Deploy/redeploy after environment variable or source changes.
7. Smoke-test Google sign-in, onboarding, marking a problem done/skipped,
   reload persistence, TXT upload, backup import/export, `/people`, and direct
   `/user/<username>` navigation.

`vercel.json` currently rewrites all paths to `index.html`. Vercel Functions
under `api/` are still served as functions; if API routing is changed, verify
`/api/search` before deployment.

## 12. Migration sequence

Apply these files in order:

1. `20261020165100_multi_user_auth_profiles.sql` — profiles, progress,
   activity, RLS, signup trigger and username availability.
2. `20261020170900_activity_calendar_streaks.sql` — `completed_on` and activity
   count rebuild.
3. `20261020174800_decouple_auth_signup_from_user_settings.sql` — signup
   trigger no longer depends on optional settings insert.
4. `20261020175400_remove_bio_signup_dependency.sql` — removes bio from
   signup-trigger requirements.
5. `20261021003000_user_uploaded_sheets.sql` — private uploaded sheet table and
   owner policies.
6. `20261021012200_public_profile_search.sql` — initial authenticated search
   and profile RPCs.
7. `20261021013500_public_profile_search_long_usernames.sql` — supports longer
   generated usernames.
8. `20261021025300_indexed_user_search_limit.sql` — indexed prefix search and
   five-result cap.
9. `20261021031600_public_profile_full_data.sql` — extends profile data for
   profile sections.
10. `20261021035000_public_profile_activity_dates.sql` — final two-argument
    profile RPC with local-date alignment and completion-date fallback.

The latest public-profile code calls
`get_public_profile(TEXT, DATE)`. If the final migration is missing, the RPC
call fails and the profile page displays a migration error. On an existing
database, do not rerun an old migration as a substitute for applying the
missing latest migration.

## 13. Known implementation boundaries

- User search, public profile pages, and their RPCs currently require a
  Supabase-authenticated caller; profiles are not accessible to signed-out
  visitors.
- Public profiles refresh by polling every 15 seconds and on focus; there is
  no Supabase Realtime subscription for profile updates.
- Activity is represented in two read paths: owner profile reads
  `activity_log`, public profile derives from `progress`. They can diverge if
  activity counts become stale.
- `src/components/Onboarding.jsx` and `src/hooks/useSupabaseProgress.js` are
  legacy implementations; the canonical flow is embedded in `App.jsx` plus
  `src/hooks/useProgress.js`.
- Vercel rewrite and frontend routing should be checked together whenever
  adding new routes or API endpoints.
- `architecture.md` is the maintained architecture document. Update it when
  routes, RPC signatures, schema migrations, environment variables, or
  persistence contracts change.
