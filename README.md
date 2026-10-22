# Track Sheet

Track Sheet is a full-stack coding-practice tracker for organizing and tracking
problem sheets. Start with the built-in DSA and Backend sheets or upload your
own, record progress and activity, and share a public learning profile.
Personal sheets and progress are synchronized to the user's account.

**Live app:** [tracksheet-rehnx.vercel.app](https://tracksheet-rehnx.vercel.app/)

## What it does

- Track problems as **to do**, **done**, or **skipped**.
- Browse built-in DSA and Backend sheets, or upload a private TXT sheet.
- Filter and search problems, collapse or expand topics, and hide skipped items.
- View solved counts, streaks, recent accepted problems, and a year-long activity
  heatmap on a profile.
- Search for other users by username and view their profiles. These features
  require sign-in.
- Export or restore progress for an individual sheet.
- Use dark or light mode and a responsive layout for desktop and mobile.

## How the application is built

```text
Browser
  React + Vite application
       ├── Supabase Auth for Google sign-in and sessions
       ├── Supabase client for account-scoped data
       └── /api/search for authenticated username search
                 │
           Vercel hosting
                 │
Supabase Auth + PostgreSQL + row-level security + SQL RPCs
```

The React application is the user interface and coordinates user actions.
Supabase provides authentication and the primary backend/database services.
PostgreSQL stores profiles, progress, activity, and personal sheet copies.
Vercel serves the built application and runs the small username-search
function. The browser uses the public Supabase anon/publishable key; it does
not connect to PostgreSQL with a database password.

## Technology

- React 18, Vite 5, JavaScript, and Tailwind CSS
- Supabase Auth, PostgreSQL, PostgREST, row-level security, and SQL RPCs
- Vercel static hosting and serverless functions
- Lucide icons

## Run locally

### Requirements

- Node.js and npm
- A Supabase project
- Google OAuth configured in Supabase to test sign-in

Install dependencies:

```bash
npm install
```

Create `.env` in the project root:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Apply the SQL migrations under
[`supabase/migrations/`](./supabase/migrations/) in filename order before
using authenticated features. See [Architecture and operations](./architecture.md)
for the database setup, authentication configuration, and deployment model.

Start the local development server:

```bash
npm run dev
```

Vite prints the local address, normally `http://localhost:5173`.

## Build and preview

```bash
npm run build
npm run preview
```

The production bundle is emitted to `dist/`.

To run the available automated checks, inspect the scripts in
[`package.json`](./package.json). The project currently defines development,
production build/preview, and sheet-conversion commands; it does not define an
automated test script.

## Built-in problem sheets

The built-in sheets are data files bundled into the frontend:

| File | Track | Problems |
| --- | --- | ---: |
| [`src/data/dsa.json`](./src/data/dsa.json) | DSA | 518 |
| [`src/data/backend.json`](./src/data/backend.json) | Backend | 84 |

Their editable text sources live in [`source/`](./source/). To update a
built-in sheet:

1. Update or add its TXT source.
2. Run `npm run convert-sheet`, or pass a filename such as
   `npm run convert-sheet -- backend.txt`.
3. Review the generated JSON in `src/data/`.
4. Commit both source and generated data.

These JSON files are templates. When an account initializes its sheets,
Supabase creates private copies so each user's sheet identifiers and progress
are isolated. Existing personal copies are not silently overwritten by later
template edits.

## Upload a personal sheet

Signed-in users can upload a TXT file from the sheets sidebar. The browser
parses it and saves the resulting sheet privately to the user's account.
Uploads are limited to 2 MB.

Supported headings and markers:

```text
Step 1 — Arrays
1.1 — Fundamentals
1. Two Sum (LC 1)
2. Best Time to Buy and Sell Stock (LC 121)

Step 2 — Dynamic Programming
3. Climbing Stairs (LC 70) (Skip)
```

Step headings and numbered problems are required. Subsection headings,
`(LC number)`, and `(Skip)` are optional. The upload parser and sample format
are in [`src/utils/parseSheet.js`](./src/utils/parseSheet.js).

## Main routes

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Tracker, sign-in, or onboarding | Sign-in required for tracker |
| `/profile` | Your profile, statistics, and progress management | Sign-in required |
| `/profile/edit` | Edit profile details | Sign-in required |
| `/people` | Search for profiles by username | Sign-in required |
| `/user/:username` | View a profile | Sign-in required |
| `/u/:username` | Legacy alias for a profile | Sign-in required |
| `/api/search?q=<prefix>` | Username autocomplete endpoint | Valid bearer session required |

Page navigation is handled by the React app; Vercel rewrites app routes to the
SPA entry point. The API route is implemented separately in
[`api/search.js`](./api/search.js).

## Data and privacy

- Supabase Auth manages identities and sign-in sessions.
- PostgreSQL stores profiles, problem states, activity counts, and personal
  sheet data.
- Row-level security restricts direct account data access to its owner.
- Profile search and profile summaries use authenticated database functions
  that return selected public-facing fields.
- Uploaded sheet JSON, email addresses, and account IDs are not exposed by
  public-profile lookups.
- Theme, selected sheet, filters, search text, and expanded sections are kept
  in browser local storage, so those preferences do not automatically sync
  between devices.

## Deploy

The application is configured for Vercel:

1. Set the repository root as the project root.
2. Use `npm run build` as the build command and `dist` as the output directory.
3. Configure the frontend environment variables listed above.
4. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the `/api/search`
   function. The public Vite variables can be used as fallbacks, but dedicated
   function variables make the deployment configuration explicit.
5. Configure Google OAuth callback and allowed return URLs in Google Cloud and
   Supabase Auth.
6. Apply all migrations in timestamp order.
7. Test sign-in, onboarding, progress sync, sheet upload/deletion, backups,
   profile search, and direct profile URLs.

Never place a Supabase service-role key in a `VITE_` variable or expose it to
the browser. The search function uses the public anon key with the caller's
verified access token.

## Project map

```text
api/                    Vercel serverless API
scripts/                Built-in sheet converter
source/                 TXT sources for built-in tracks
src/
  App.jsx               Authentication flow, routing, tracker, profile UI
  components/           Shared brand, tooltip, profile settings UI
  data/                 Bundled built-in track templates
  hooks/useProgress.js  Progress, activity, theme, and sync behavior
  lib/supabase.js       Browser Supabase client
  utils/parseSheet.js   TXT upload parser and sample template
  index.css             Theme, component, and responsive styles
  main.jsx              React entry point and render error boundary
supabase/migrations/    Database schema, access policies, and RPC history
architecture.md         System design and operating guide
```

For the request flows, data contracts, access-control model, migration
sequence, and operational details, continue to
[Architecture and operations](./architecture.md).
