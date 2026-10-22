# Track Sheet — Architecture and Operations

This guide explains how Track Sheet works as a system: what runs in the
browser, what runs on Vercel and Supabase, how data moves between them, and
how the database protects account information. It is intended to make the
project understandable without requiring a code walkthrough.

## 1. Product model

Track Sheet is a multi-user problem-sheet tracker. A signed-in user can:

- choose from built-in DSA and Backend tracks;
- upload and manage private TXT-based tracks;
- mark individual problems done or skipped;
- search and filter a track;
- review completion totals, activity, and streaks;
- export or restore progress;
- maintain a profile and view profiles of other signed-in users.

The built-in tracks contain 518 DSA problems and 84 Backend problems. Their
JSON data is bundled with the frontend as templates. Each signed-in account
gets its own database-backed copies, which allows progress and sheet deletion
to be scoped to that account.

## 2. System overview

```text
┌──────────────────────────────── Browser ───────────────────────────────┐
│ React 18 SPA, built by Vite                                             │
│                                                                         │
│  Screens and interactions ── useProgress ── Supabase JS client           │
│           │                               │                              │
│           ├── static built-in JSON        ├── Supabase Auth              │
│           └── localStorage preferences   ├── PostgREST table requests   │
│                                           └── PostgreSQL RPC requests   │
└─────────────────────────────────────────────────────────────────────────┘
                   │                                │
                   ▼                                ▼
          Vercel static site                Supabase project
          and /api/search                   ├── Auth
                   │                        ├── PostgreSQL
                   └── token-verified RPC   └── RLS + SQL functions
```

### Responsibilities

| Part | Responsibility |
| --- | --- |
| React application | Renders the tracker and profiles, handles UI state, validates user input, and requests account data. |
| Supabase Auth | Handles Google OAuth, issues and refreshes sessions, and identifies the current user. |
| Supabase database API | Exposes PostgreSQL table and RPC requests to the browser under the caller's session and database permissions. |
| PostgreSQL | Stores accounts' profiles, problem states, activity, and private sheet records. |
| SQL migrations | Create and evolve schema, indexes, RLS policies, triggers, and database functions. |
| Vercel | Hosts the Vite output and invokes `api/search.js` for username autocomplete. |
| Browser localStorage | Saves convenience preferences for the current browser; it is not the account data store. |

The browser does not open a PostgreSQL connection. It sends HTTPS requests to
Supabase using the project's public anon/publishable key and, when signed in,
the current user's access token. PostgreSQL's row-level security (RLS) and
function permissions determine what the request can access.

## 3. Application startup and authentication

### Startup sequence

1. `src/main.jsx` imports global CSS and mounts `App` inside a React error
   boundary.
2. `src/lib/supabase.js` reads `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. If either is absent, the browser client is not
   created and the UI reports that Supabase is not configured.
3. `App` asks Supabase Auth for the restored session and subscribes to auth
   changes.
4. When a session has a user, `App` fetches that user's `profiles` row.
5. Profile onboarding status selects the next screen:
   - no completed profile: onboarding;
   - completed profile: authenticated tracker.
6. The tracker initializes that user's sheet copies and loads their progress
   and activity.

The top-level states are `LOADING`, `UNAUTHENTICATED`, `ONBOARDING`, and
`AUTHENTICATED`. People search and profile views are screens inside the
authenticated application. A URL that looks shareable is not an anonymous
public endpoint: viewing it still requires a signed-in session.

### Google sign-in and onboarding

The browser starts Google OAuth through Supabase Auth. Supabase handles the
provider exchange and returns the user to the application origin. Google
client credentials are configured in Supabase, not in frontend source or
`VITE_` values.

An Auth database trigger creates a minimal profile row when a new Auth user is
created. The user then completes onboarding with a name and username; location
and website are optional. The `onboarding_completed` field determines whether
the tracker can be entered. Username availability is checked by the
`is_username_available` database function, and uniqueness is also enforced by
a database index.

Editing the profile updates the user's own row in `profiles`. Email comes
from Auth and is displayed only on the signed-in user's own profile.

## 4. Routes and navigation

The app implements page navigation with the browser History API and
`popstate`; it does not use React Router. Route state is parsed from
`window.location.pathname`.

| Path | Screen | Access |
| --- | --- | --- |
| `/` | Sign-in, onboarding, or tracker according to auth/profile state | Tracker requires sign-in |
| `/profile` | Owner profile, statistics, and data management | Sign-in required |
| `/profile/edit` | Edit owner profile fields | Sign-in required |
| `/people` | Username-prefix search | Sign-in required |
| `/user/:username` | Profile view | Sign-in required |
| `/u/:username` | Legacy alias for profile view | Sign-in required |
| `/api/search?q=<prefix>` | Vercel username search function | Valid bearer token required |

`vercel.json` sends page paths to `index.html`, allowing direct navigation and
refresh of client-side routes. Vercel still handles `/api/search` as a
serverless function.

The authenticated tracker also includes a responsive mobile layout. On
small screens, its search/filter toolbar stays visible while browsing; the
sheets list opens as a drawer; and profile heatmaps retain all 53 weeks and
can be swiped horizontally.

## 5. Main browser modules

| Module | Responsibility |
| --- | --- |
| `src/main.jsx` | React entry point, global stylesheet import, render error boundary. |
| `src/App.jsx` | Authentication state machine, onboarding, history-based navigation, tracker, sheets, profiles, import/export, and custom dialogs. |
| `src/hooks/useProgress.js` | Loads and updates cloud progress/activity, applies optimistic updates, serializes writes, and manages theme. |
| `src/components/ProfileSettings.jsx` | Profile edit form and save/availability flow. |
| `src/components/TrackSheetBrand.jsx` | Shared clickable product branding and current-page/track label. |
| `src/components/Tooltip.jsx` | Accessible themed tooltip behavior for interactive controls. |
| `src/lib/supabase.js` | Creates the browser Supabase client from the public Vite environment variables. |
| `src/utils/parseSheet.js` | Parses user-uploaded TXT sheets and exports the sample format. |
| `src/data/*.json` | Built-in sheet templates included at build time. |
| `api/search.js` | Authenticated username-prefix search function. |
| `supabase/migrations/*.sql` | Database schema, RLS policies, triggers, indexes, and RPC implementations. |

Most product UI is intentionally concentrated in `App.jsx`; profile settings,
the brand, and tooltip are extracted components. `src/components/Onboarding.jsx`
and `src/hooks/useSupabaseProgress.js` are legacy implementations. The active
onboarding screen is embedded in `App.jsx`, and active progress synchronization
is implemented by `useProgress.js`.

## 6. Sheets and problem identifiers

### Sheet data shape

A sheet is JSON shaped as a set of ordered steps, subsections, and problems:

```text
Sheet
└── steps[]
    ├── id
    ├── title
    └── subsections[]
        ├── id
        ├── title (optional for implicit subsections)
        └── problems[]
            ├── id
            ├── title
            ├── lc (optional LeetCode number)
            └── defaultSkip
```

The frontend loads all valid `src/data/*.json` files at build time. A
filename becomes the template ID (`dsa.json` → `dsa`); titles are derived from
that ID, with DSA displayed as “DSA”.

### Per-account built-in copies

Templates are not the user's live sheet records. After sign-in, the browser
sends built-in template metadata and JSON to
`ensure_builtin_sheet_copies(requested_sheets)`. The authenticated SQL
function:

1. verifies the caller and validates the template list and data size;
2. serializes initialization for that user with an advisory transaction lock;
3. creates any missing personal copies;
4. skips templates that have a deletion tombstone;
5. migrates legacy DSA/Backend progress identifiers into the UUID-based
   identifiers for a first personal copy.

An existing copy is not overwritten by new template JSON. This preserves
user-owned sheet contents and progress if a built-in template changes later.

Personal sheet records are in `user_sheets`. Both a built-in copy and an
uploaded sheet have an internal UUID and are represented in the app with a
namespaced sheet ID:

```text
custom-<user_sheets UUID>
```

Individual problems are namespaced under that sheet:

```text
custom-<user_sheets UUID>::<problem ID from the sheet>
```

The prefix prevents ID collisions when two sheets reuse local IDs such as
`s1-1.1-p1`. The user's selected sheet is saved in localStorage.

### Uploading a personal sheet

The browser:

1. accepts `.txt` files no larger than 2 MB;
2. reads and parses the file using `parseSheet`;
3. requires at least one step and one problem, rejects empty titles and
   duplicate problem IDs, and extracts optional LeetCode/skip markers;
4. derives a title from the filename;
5. inserts the parsed JSON into the authenticated user's `user_sheets` row.

Supported headings are `Step N — Title`; subsection headings such as
`1.1 — Title` are optional. Problem lines are numbered and expected to be
sequential, including when multiple lines are accidentally joined together.
The parser handles common joined-line cases by detecting the next expected
problem number.

### Deleting a sheet

The client calls `delete_user_sheet(UUID)` rather than deleting rows directly.
The function confirms ownership, deletes sheet-specific progress, updates
activity counts for removed solved problems, and deletes zero-count activity
rows. Deleting a built-in copy also creates a tombstone in
`user_deleted_builtin_sheets`, preventing automatic recreation for that user.
The shared JSON template and other users' copies are unaffected.

## 7. Progress, synchronization, and activity

### Problem states

Progress is keyed by `(user_id, problem_id)` and has one of three states:

- `todo`
- `done`
- `skipped`

An absent row is treated as `todo`, except a problem whose template has
`defaultSkip: true`, which is displayed as skipped unless the user has saved
another state.

When a user changes a problem, `useProgress.update()` updates the local React
state immediately, then queues the database write. The write queue ensures
that rapid updates from one browser session execute in order. A failed write
is logged and surfaced as a sync error in the UI. This is optimistic
synchronization, not a durable offline queue: a pending write is not
guaranteed to survive closing or reloading the page.

`bulkUpdate()` follows the same model for imported backup entries. Reset can
delete one sheet's problem rows or all of the user's progress and activity.

### Completion dates and activity counts

When a problem transitions to done, the hook records:

- `completed_on`: the user's local calendar date (`YYYY-MM-DD`);
- `updated_at`: an ISO timestamp.

The hook changes the `activity_log` count for the affected completion date.
Changing a done problem back to todo/skipped reduces the count for the date it
was originally completed. A problem marked skipped does not add activity.
The write queue persists progress and the corresponding activity updates.

The signed-in owner's heatmap and streak calculations use loaded
`activity_log` counts. The public-profile database function derives activity
and streak dates from done rows in `progress`; it prefers `completed_on` and
falls back to the UTC date of `updated_at` for older rows. These are distinct
read paths and can disagree if activity rows drift. Completion dates on
progress rows are the best source when investigating a discrepancy.

Both profile views display the most recent 53 weeks. On mobile, the grid is
horizontally scrollable and initially positioned at the latest weeks.

### Profile summaries

The owner profile combines:

- profile fields and Auth email;
- sheet totals and progress;
- current and longest streak;
- yearly activity heatmap and active-day count;
- recent accepted problems;
- owner-only import/export and reset controls.

The public profile omits email, account identifiers, private settings, and raw
uploaded sheet JSON. It displays selected profile fields, solved/streak
summaries, sheet title/count summaries, activity, and up to eight recent
accepted items. Public profile data refreshes periodically while the page is
open and on browser focus.

## 8. Progress backup format

Export and import operate on one selected sheet. An export contains only
explicitly done or skipped problems, as a JSON object keyed by problem title:

```json
{
  "Two Sum": {
    "id": "custom-<sheet UUID>::s1-1.1-p1",
    "state": "done"
  }
}
```

Import validates the JSON shape and state values. It first tries a direct ID
match, then matches normalized problem titles and local IDs. This permits
restoring a backup to a matching sheet copy whose UUID differs. Unknown or
ambiguous problems are ignored; if none match, the user receives a message.
Successful imports are saved through the same queued progress path.

## 9. Persistence map

| Information | Source of truth | Scope |
| --- | --- | --- |
| Account identity and OAuth session | Supabase Auth | User account |
| Name, username, location, website, onboarding state | `profiles` | One row per Auth user |
| Problem state and completion date | `progress` | User + namespaced problem ID |
| Daily solved count | `activity_log` | User + calendar date |
| Built-in copies and uploads | `user_sheets` | User-owned sheet |
| Deleted built-in IDs | `user_deleted_builtin_sheets` | User + template ID |
| Theme | Browser `localStorage`, key `theme` | Browser/device |
| Selected sheet | Browser `localStorage`, key `dsa-active-sheet` | Browser/device |
| Search/filter/expanded state | Browser `localStorage` (`dsa-search`, `dsa-filter`, `dsa-hide-skipped`, `dsa-expanded-steps`, `dsa-expanded-subs`) | Browser/device |

The `user_settings` table remains in the schema for compatibility, but the
active application stores its current tracker preferences in localStorage.
Those preferences do not sync between browsers or devices.

## 10. Database model and access control

Timestamped SQL files in `supabase/migrations/` are the source of truth for
database schema and policies. Apply every migration in timestamp order on a
new Supabase project; apply missing migrations to an existing database.

### Core tables

#### `profiles`

One row per `auth.users` identity. Stores display name, username, optional
location/website, onboarding status, and update time. Username matching is
case-insensitive and has a supporting prefix-search index. The account
creation trigger inserts a generated placeholder username; onboarding lets
the user choose their public username.

#### `progress`

Stores a user's state for a namespaced problem ID. The primary key is
`(user_id, problem_id)`. Rows include `state`, `updated_at`, and
`completed_on` (added by the activity-calendar migration). The user foreign
key cascades when the owning profile is removed.

#### `activity_log`

Stores daily activity counts keyed by `(user_id, date)`. Counts are updated
alongside progress writes and rebuilt from progress during the migration that
introduces completion dates.

#### `user_sheets`

Stores private sheet metadata and JSON: owner UUID, title, source filename,
sheet data, creation timestamp, and optional `builtin_template_id`. A partial
unique index enforces one copy of each built-in template per user. RLS scopes
direct reads/inserts to the owner. Cross-user profile functions do not expose
the raw JSON.

#### `user_deleted_builtin_sheets`

Stores deletion tombstones by `(user_id, sheet_id)`. The personal-copy
bootstrap function checks these rows before provisioning a template. The
table is not a client-managed preference surface.

#### `user_settings`

Legacy settings table with owner-scoped RLS. The current frontend does not use
it for active tracker preferences.

### RLS and SQL function boundary

RLS is enabled on account-owned tables. Direct table operations are restricted
to the authenticated owner with policies based on `auth.uid()`. Cross-user
profile discovery is intentionally handled through narrowly scoped SQL
functions rather than broad table-read policies.

The cross-user functions are `SECURITY DEFINER`, use a fixed `search_path`,
require an authenticated identity, and have execute permissions restricted to
the authenticated role. Their returned fields should remain narrowly scoped:

| Function | Purpose and return contract |
| --- | --- |
| `is_username_available(candidate_username)` | Check whether a candidate username is available to the caller. |
| `search_public_profiles(search_term)` | Return at most five onboarding-complete prefix matches as `{ name, username }`. |
| `ensure_builtin_sheet_copies(requested_sheets)` | Provision or migrate the caller's built-in sheet copies. |
| `delete_user_sheet(requested_sheet_id)` | Delete an owned sheet, related progress, activity deltas, and a built-in tombstone when applicable. |
| `get_public_profile(requested_username, requested_today)` | Return the selected public profile, activity/streak summary, safe sheet summaries, and recent accepted items. |

The profile function intentionally omits email, Auth IDs, credentials, todo
rows, private UI settings, sheet UUIDs, and uploaded sheet JSON. Treat
additions to its return shape as privacy-sensitive changes.

## 11. People search and public profile request flow

### Username autocomplete

1. The signed-in user enters at least three characters in `/people`.
2. The browser obtains the current Supabase session access token.
3. The browser sends `GET /api/search?q=<prefix>` with a bearer token.
4. `api/search.js` accepts GET only and validates a 3–48 character
   alphanumeric/hyphen prefix.
5. The function calls Supabase Auth `getUser(token)` to validate the caller.
6. It invokes `search_public_profiles` using the anon key and the verified
   caller token.
7. It returns at most five `{ name, username }` results and uses private,
   no-store cache headers.

The function does not use a service-role key. The SQL function also applies
the authenticated caller and onboarding-complete checks.

### Public profile

Selecting a search result navigates to `/user/<username>`; `/u/<username>` is
also supported. The frontend calls
`get_public_profile(requested_username, requested_today)` using the browser's
local calendar date. The SQL function computes solved dates, activity,
streaks, and carefully limited sheet summaries. The frontend maps safe
progress summaries against built-in JSON and renders profile data. Uploaded
sheet contents remain private.

## 12. TXT sheet authoring and parser rules

Two independent tools handle text sheets:

- `scripts/convert-sheet.cjs` converts repository-maintained source text into
  build-time JSON templates.
- `src/utils/parseSheet.js` parses user-uploaded text in the browser.

The upload parser normalizes CRLF line endings, recognizes Step and optional
subsection headings using em dash, en dash, or hyphen separators, handles
common joined-line cases, and splits sequential problem numbers. It extracts
`(LC N)` into the `lc` property, converts `(Skip)` into `defaultSkip`, and
removes those markers from the displayed title.

When changing a built-in sheet, update both its source and generated JSON.
When changing upload parsing, preserve compatibility with the sample format
and existing saved sheet JSON.

## 13. UI behavior and themes

The default theme is dark. `useProgress` reads and writes the `theme` local
storage value and applies `data-theme="light"` to the document root for light
mode. `src/index.css` defines CSS variables for page, surface, border, text,
and theme colors; some components also use Tailwind utility colors.

The authenticated interface includes:

- searchable and filterable problem groups;
- custom confirmations and notices styled to match the application;
- accessible hover/focus tooltips;
- desktop sheets sidebar and mobile drawer;
- mobile search/filter controls that stay visible while scrolling;
- a compact mobile overall-progress summary;
- full 53-week profile heatmaps that can be horizontally swiped on narrow
  screens.

`src/main.jsx` wraps the application in a React error boundary. A render
exception is logged and shows a reload fallback; asynchronous request errors
are surfaced in the relevant UI or sync-error message.

## 14. Environment and configuration

### Browser build

| Variable | Used by | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase browser client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase browser client | Public anon/publishable key |

Vite embeds `VITE_` values in browser output. Never place a service-role key or
other secret in one.

### Vercel function

`api/search.js` reads:

- `SUPABASE_URL`, with fallback to `VITE_SUPABASE_URL`;
- `SUPABASE_ANON_KEY`, with fallback to `VITE_SUPABASE_ANON_KEY`.

Use the same project URL and public anon/publishable key. The function verifies
each caller token and executes the search RPC as that caller.

### Google OAuth

Configure the Google provider in Supabase Auth. In Google Cloud, register the
Supabase callback URL. In Supabase Auth URL configuration, allow the deployed
site URL and intended local/preview origins. Keep provider secrets in the
Supabase dashboard.

## 15. Local development, validation, and deployment

### Local development

```bash
npm install
npm run dev
```

Create the local `.env` values described above. Do not commit `.env`.

### Production build

```bash
npm run build
npm run preview
```

`npm run build` checks that Vite can bundle the production application.
`package.json` currently has no automated test or lint script.

### Vercel deployment

1. Set the repository root as the Vercel project root.
2. Configure build command `npm run build` and output directory `dist`.
3. Add frontend and function variables.
4. Configure Google and Supabase redirect URLs for the deployment origin.
5. Apply database migrations in timestamp order.
6. Deploy, then verify authentication, onboarding, saving progress, uploading
   and deleting sheets, backup import/export, people search, public profiles,
   and direct page-route refresh.

## 16. Migration history

The following migrations are applied in filename/timestamp order:

1. `20261020165100_multi_user_auth_profiles.sql` — profile, progress,
   activity, and legacy settings tables; owner RLS; signup profile trigger;
   username availability.
2. `20261020170900_activity_calendar_streaks.sql` — completion calendar date
   and activity-history backfill/rebuild.
3. `20261020174800_decouple_auth_signup_from_user_settings.sql` — signup
   trigger no longer depends on inserting a settings row.
4. `20261020175400_remove_bio_signup_dependency.sql` — signup no longer
   depends on the legacy bio field.
5. `20261021003000_user_uploaded_sheets.sql` — private user sheet storage and
   owner policies.
6. `20261021012200_public_profile_search.sql` — initial authenticated profile
   search and profile functions.
7. `20261021013500_public_profile_search_long_usernames.sql` — support for
   longer generated usernames.
8. `20261021025300_indexed_user_search_limit.sql` — prefix index and five
   result cap.
9. `20261021031600_public_profile_full_data.sql` — profile summaries needed
   by the profile views.
10. `20261021035000_public_profile_activity_dates.sql` — current
    `get_public_profile(TEXT, DATE)` signature and local-date activity
    handling.
11. `20261021120000_delete_uploaded_sheets.sql` — server-side deletion of an
    owned sheet and associated progress/activity.
12. `20261021133000_user_hidden_sheets.sql` — per-user hidden built-in sheet
    tracking used by the prior lifecycle.
13. `20261021180000_personal_sheet_copies.sql` — built-in personal copies,
    legacy progress migration, deletion tombstones, and ownership-checked
    deletion.

For a fresh database, apply all migrations. For an existing database, apply
only migrations that have not already been applied, in order. The current
client expects the latest profile function signature and personal-sheet RPCs;
missing migrations produce visible sheet/profile errors.

## 17. Operational considerations and known boundaries

- **Authenticated profiles:** search and profile views require a signed-in
  caller; they are not publicly accessible to anonymous visitors.
- **Activity sources:** the owner's heatmap reads `activity_log`; public
  profile activity is derived from progress completion dates. If they differ,
  compare solved progress rows and activity counts.
- **Cloud-first progress:** optimistic updates improve responsiveness, but the
  app does not maintain a durable offline write queue.
- **Preferences are local:** localStorage preferences are per browser/device
  and are not restored by signing in on another device.
- **Built-in copies persist:** changing a JSON template does not rewrite
  existing personal copies.
- **Route configuration:** verify both SPA rewrites and API routing when
  adding routes or serverless endpoints.
- **Large client bundle:** Vite reports a chunk-size advisory during the
  production build; it does not fail the build.

## 18. Troubleshooting

| Symptom | What to check |
| --- | --- |
| App reports Supabase is not configured | Confirm both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart Vite. |
| Google sign-in or callback fails | Check Google provider settings, Supabase callback URL, Site URL, and allowed redirect URLs. |
| Profile cannot load | Confirm all migrations are applied, especially the latest public-profile migration. |
| Sheets fail to load | Confirm the personal-sheet migration and its RPC grants are installed. |
| Progress does not sync | Check the browser console and visible sync error; verify Supabase connectivity and owner RLS policies. |
| `/people` search fails | Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` on Vercel, bearer-session validity, and the search RPC migration. |
| A route fails on direct refresh | Check the Vercel SPA rewrite and ensure function routes remain reachable. |
| Owner and public heatmaps differ | Compare `progress.completed_on`/`updated_at` with `activity_log` rows for that account. |
