# Track Sheet

Track Sheet helps you organize coding-practice sheets, track problem progress,
and view your activity over time. It supports built-in and personal TXT-based
sheets, Google sign-in, cloud-saved progress, and searchable profiles for
signed-in users.

## Features

- **Multiple problem sheets:** includes built-in DSA and Backend sheets.
- **Personal sheets:** upload a TXT sheet; its parsed contents are stored
  privately in your Supabase account.
- **Per-problem tracking:** mark problems done or skipped, filter the list, and
  search problem titles.
- **Cloud persistence:** progress, completion dates, activity, and profile
  details are stored per signed-in account.
- **Progress profiles:** view streaks, sheet progress, Recent AC, and a
  year-style activity heatmap on your own profile.
- **People search:** find a user by username and view their public profile.
  Search and profile viewing require sign-in.
- **Backups:** export or import progress for a selected sheet.
- **Themes:** dark mode by default with a light theme option.

## Tech stack

- React 18 and Vite 5
- Supabase Auth and PostgreSQL
- Vercel static hosting and serverless functions
- Tailwind CSS and Lucide icons

## Run locally

### Requirements

- Node.js and npm
- A Supabase project with the repository migrations applied
- Google OAuth configured in Supabase if testing sign-in

### Install and configure

```bash
npm install
```

Create a local `.env` in the repository root:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Use the public anon/publishable key only. Never put a Supabase service-role key
in a `VITE_` variable or commit `.env`.

Start the development server:

```bash
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`).

## Supabase setup

Apply every SQL migration under [`supabase/migrations/`](./supabase/migrations/)
in filename timestamp order. The current public-profile implementation requires
the latest migration,
[`20261021035000_public_profile_activity_dates.sql`](./supabase/migrations/20261021035000_public_profile_activity_dates.sql).

Configure Google authentication:

1. Enable Google under Supabase **Authentication → Providers** and enter the
   Google OAuth client ID and secret.
2. Add the Supabase callback URL shown in Supabase to the Google OAuth
   authorized redirect URIs.
3. Set the production Site URL and allowed redirect URLs in Supabase Auth.
   Include local development and any Vercel preview origins you use.
4. Add the production and intended preview origins to the Google OAuth
   authorized JavaScript origins.

The sign-in secret stays in Supabase. The browser uses only the public project
URL and anon/publishable key.

## Built-in sheets

Built-in sheets are JSON files under [`src/data/`](./src/data/), loaded
automatically at build time. The filename (without `.json`) becomes the sheet
ID and, in most cases, its display title:

- `src/data/dsa.json` → **DSA**
- `src/data/backend.json` → **Backend**

To create/update a built-in sheet:

1. Add its source TXT under [`source/`](./source/).
2. Run:

   ```bash
   npm run convert-sheet
   ```

3. Select the source file when prompted, or pass its filename:

   ```bash
   npm run convert-sheet -- backend.txt
   ```

4. Review the generated JSON in `src/data/` and commit both source and JSON.

Built-in DSA problem identifiers remain unprefixed for compatibility with
existing progress. Other built-in sheet IDs are namespaced as
`<sheet-id>::<problem-id>`.

## Upload a personal TXT sheet

Signed-in users can select **Upload a TXT sheet** from the sheets sidebar. The
browser parses the file and stores the converted sheet in the user's private
`user_sheets` row. Uploads are limited to 2 MB.

The supported format uses `Step N — Title` headings and sequential numbered
problem lines. Subsection headings are optional. `(LC 123)` and `(Skip)` are
optional markers.

```text
Step 1 — Arrays
1.1 — Fundamentals
1. Two Sum (LC 1)
2. Best Time to Buy and Sell Stock (LC 121)

Step 2 — Two Pointers
3. Valid Palindrome (LC 125)
4. 3Sum (LC 15) (Skip)
```

Download the sample TXT from the upload sidebar. The parser and sample are in
[`src/utils/parseSheet.js`](./src/utils/parseSheet.js). Custom problem IDs are
namespaced by the owner's sheet ID; uploaded sheet contents are not exposed
through the public-profile API.

## Routes

| Route | Purpose | Authentication |
| --- | --- | --- |
| `/` | Tracker, sign-in, or onboarding | Tracker requires sign-in |
| `/people` | Search user profiles by username | Required |
| `/user/:username` | Shareable profile page | Required |
| `/u/:username` | Legacy profile URL alias | Required |
| `/api/search?q=<prefix>` | Username autocomplete API | Bearer token required |

Vercel rewrites app routes to `index.html`; the API route is handled by
[`api/search.js`](./api/search.js).

## Data and privacy

- Supabase Auth manages accounts and sessions.
- `profiles` contains the user's display name, username, location, website, and
  onboarding status.
- `progress` stores each account's problem state and completion timestamps.
- `activity_log` stores daily activity counts used by the signed-in owner's
  heatmap.
- `user_sheets` stores uploaded sheet data under owner-only row-level security.
- Tracker preferences such as selected sheet, theme, filters, and expanded
  sections are stored in browser localStorage.
- Direct table access is owner-scoped by RLS. Cross-user lookup uses
  authenticated-only SQL RPCs that return selected profile/progress summaries,
  not email, credentials, or raw uploaded sheets.

The owner heatmap reads `activity_log`; public profile activity is derived from
solved progress rows and completion dates. The migration history includes
backfill/rebuild logic for the activity table. If these views ever differ,
investigate the progress completion dates and activity rows for that account.

## Deployment

### Vercel

1. Import the repository into Vercel with the repository root as the project
   root.
2. Set the build command to `npm run build` and the output directory to `dist`.
3. Add these environment variables to the deployment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (for `/api/search`)
   - `SUPABASE_ANON_KEY` (for `/api/search`)
4. Use the Supabase project URL and public anon/publishable key for both
   frontend and function variables. Do not use a service-role secret.
5. Configure Supabase and Google OAuth URLs for the deployed domain.
6. Apply the Supabase migrations in timestamp order.
7. Deploy and smoke-test sign-in, onboarding, progress persistence, sheet
   upload, backups, `/people`, and direct profile URLs.

`vercel.json` contains the SPA rewrite for direct route loads. Redeploy after
changing source or Vercel environment variables.

### Production build locally

```bash
npm run build
npm run preview
```

The build output is written to `dist/`. The available npm scripts are listed in
[`package.json`](./package.json); there is no automated test script currently
defined there.

## Project structure

```text
api/                    Vercel serverless functions
source/                 TXT sources for built-in sheets
scripts/                Built-in sheet converter
src/
  components/           Profile settings and legacy onboarding component
  data/                 Built-in sheet JSON
  hooks/                Supabase progress persistence
  lib/                  Supabase browser client
  utils/                User-upload TXT parser/template
  App.jsx               Main application, routes, and primary views
  index.css             Global styles and theme tokens
  main.jsx              React entry point and render error boundary
supabase/migrations/    Database schema and access-control changes
architecture.md         Detailed architecture and operations guide
```

For deeper system behavior, database contracts, security boundaries, and
maintenance notes, see [`architecture.md`](./architecture.md).
