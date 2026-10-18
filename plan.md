# DSA Sheet Tracker: Final Build Plan

> For Claude Code. Build the whole project described here. Read the full plan first, then follow the build order in section 12. Ask me only if something is truly blocking.

## 1. Goal

A public website where anyone can track progress on a DSA problem sheet.

- Stack: React + Vite + Tailwind + lucide-react. Plain React state, no extra state library.
- Works without login (progress in localStorage). With login, progress syncs across devices.
- Source data: my renumbered sheet (PDF/Excel/CSV placed in `/source/`). Expected result: **18 Steps, 518 problems, 60 default-Skip problems**. Verify these counts after conversion and tell me if they differ.

## 2. Layout (follows the reference screenshot)

Reference: the takeUforward A2Z sheet screenshot (`/reference/reference.png`, I will put it in the project). Copy its **layout and feel only**. Do not copy its logo, name, fonts or any assets.

- **Dark-first UI:** near-black page, slightly lighter rounded panels.
- **Top bar:** logo/title at left, search icon at right, theme toggle, login/avatar. Overall progress is a thin bar plus text `X / 518 done`, with `Y skipped` next to it.
- **Main column (wide):** the 18 Steps as a vertical list.
  - **Step row:** chevron, Step name, a thin purple/navy progress bar, and a `done/total` count at the right (e.g. `20/32`). Collapsible.
  - **Sub-section row:** indented under the Step, joined by a thin tree-connector line from the Step. Chevron, name, thin progress bar, `done/total` count. Collapsible. Collapsed sections look dimmed.
  - **Problems:** shown inside one rounded dark panel per sub-section, one row per problem, with a small gap between rows.
- **Right sidebar (desktop only):** small panels, for example "Continue where I left off" and a summary of done / skipped / to do. It is hidden on mobile. A left Step rail is not needed.
- **Mobile:** single column, sidebar content moves into a collapsible block under the top bar.

```
┌───────────────────────────────────────────────────────────┐
│ DSA Sheet                         🔍  ◐  (avatar)         │
├────────────────────────────────────────────┬──────────────┤
│ ⌄ Arrays                  ━━━━━──  20/32   │ Progress     │
│   ⌄ Fundamentals          ━━━━━━━   6/6    │ 212 / 518    │
│   ┌──────────────────────────────────────┐ │ 60 skipped   │
│   │ ☑ Linear Search                      │ │              │
│   │ ☑ Largest Element                    │ │ [Continue]   │
│   │ ☐ Left Rotate by One          [Skip] │ │              │
│   └──────────────────────────────────────┘ │              │
│   ⌄ Logic Building        ━━──────  3/5    │              │
└────────────────────────────────────────────┴──────────────┘
```

## 3. Problem rows

- **Only these elements:** checkbox, title, and a Skip toggle. Nothing else.
- Checkbox is a small rounded square. Green with a white tick when done, with a smooth tick animation.
- Title turns dimmed and gets a strike-through when done.
- **Skip toggle:** a small, quiet icon button at the right end of the row. A skipped row is muted and gets a small orange "Skip" text label.
- **Do NOT add:** difficulty tags (Basic/Core/etc.), bookmark icon, notes icon, YouTube icon, article icon, LeetCode/CodeStudio icons, three-dot menu, or any other per-row icons.
- No LC badge and no outside links in this version. The `lc` field stays in the JSON for later.
- Each problem is in exactly one state: **todo, done or skipped**.

## 4. Skip behaviour

- The 60 Skip problems from the sheet start as `skipped` (field `defaultSkip: true`), with an orange look and a "Skip" tag.
- Any user can switch a skipped problem back to normal, and any problem can be skipped. Each user decides for themselves.
- **Skipped problems are COUNTED in the total.** The denominator is always 518. A skipped problem is not "done". It only adds to the Skipped count.
- Header shows the ring `done / 518` and a breakdown `X done · Y skipped · Z to do`.
- The "Hide skipped" switch only hides rows. It never changes any counts.

## 5. Progress and controls

- Overall progress: thin bar in the top bar with `X / 518 done`, plus `Y skipped` and `Z to do` in the sidebar.
- Step and sub-section progress bars as described in section 2.
- Filter chips: All, To do, Done, Skipped, plus the "Hide skipped" switch.
- Search by problem title.
- Expand all, Collapse all.
- "Continue where I left off" jumps to the first problem that is still to do.
- Export and import of a JSON backup, plus a reset option with a confirm dialog.

## 6. Design

- **Style:** match the reference screenshot: dark, calm, flat, lots of spacing, rounded panels, thin progress bars, tiny details. No gradients, no heavy shadows, no extra badges.
- **Colors (design tokens as CSS variables):**
  - Dark page `#0B0B0F`, panel `#15151B`, row hover `#1C1C24`, border `#26262F`, text `#E8E8EE`, muted text `#8A8A98`.
  - Accent for progress bars and focus: purple/indigo `#6D5BF6`.
  - Done checkbox: green `#22A559`.
  - Skip: orange `#E65100`, used only for Skip.
  - A matching light theme using the same tokens, with background `#F6F8FB`.
- **Theme:** dark by default. Light theme is available with a toggle. The choice is remembered.
- **Fonts:** one clean sans-serif (Figtree or similar). Use tabular numbers for counts.
- **Icons:** lucide-react, used sparingly (chevrons, search, theme, skip).
- **Motion:** only in response to actions: smooth accordion open/close, tick animation, progress bar fill. No page-load effects. Respect `prefers-reduced-motion`.
- **Accessibility:** proper accordion and checkbox semantics, keyboard navigation, visible focus states, good contrast.
- **Responsive:** works well on phone and desktop.

## 7. Data

One JSON file, `src/data/sheet.json`, generated from the sheet:

```
{ steps: [ { id, title, subsections: [ { id, title, problems: [ { id, title, lc, defaultSkip } ] } ] } ] }
```

- IDs must be stable and unique (for example `s3-1-p4`). Never derive them from array position, so later edits don't break saved progress.
- The site only reads this file, so I can add problems later by editing it.
- Keep the conversion script in `/scripts/` and a check script that prints and asserts the counts.

## 8. State and storage

- Progress is a map `problemId → "done" | "skipped"`. A missing id means "todo" unless `defaultSkip` is true. Store only the user's differences from the defaults.
- `useProgress` hook handles state, saving and syncing. Components should not touch storage directly.
- **Guest mode:** localStorage. The site works with no signup.
- **Logged in:** Supabase database. The UI updates immediately (optimistic) and saves in the background. Show a small "saved" or "offline" indicator and retry on failure.

## 9. Login and database (Supabase)

- Email and Google sign-in via Supabase Auth.
- Table:

```sql
create table progress (
  user_id uuid references auth.users not null,
  problem_id text not null,
  state text not null check (state in ('done','skipped','todo')),
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);
alter table progress enable row level security;
create policy "own rows" on progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- Provide this SQL in `/supabase/schema.sql`.
- **Guest to account merge:** when a guest signs in, merge the browser progress into their account. If the same problem differs, the most recent `updated_at` wins. Then keep the account as the source of truth.
- Read keys from `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never commit secrets. Include `.env.example`.
- If the keys are missing, the app must still run in guest mode without crashing.

## 10. Components

`TopBar`, `OverallProgress`, `SidePanel`, `FilterBar`, `StepRow`, `SubSectionRow`, `ProblemPanel`, `ProblemRow`, `ProgressBar`, `ThemeToggle`, `AuthButton`, `ExportImportMenu`.

## 11. Performance

- 518 rows is small, but avoid re-rendering everything on each tick. Memoize rows and compute per-Step counts efficiently.
- Render the content of collapsed sections lazily.

## 12. Build order

1. Convert the sheet to JSON. Run the check script (18 Steps, 518 problems, 60 Skip). Report the result before continuing.
2. Scaffold Vite + React + Tailwind. Set up design tokens, fonts and theme.
3. Build the accordions, problem rows, progress bars, with guest-mode storage.
4. Add search, filters, Hide skipped, expand/collapse all, "continue", and export/import/reset.
5. Add Supabase login, sync and the guest-to-account merge.
6. Polish: animations, accessibility, keyboard support, mobile pass, light/dark check.
7. Write the README and the deploy guide.

## 13. Deliverables

- Complete project that runs with `npm install && npm run dev`.
- README: setup, how to create the Supabase project, how to enable Google sign-in, how to run `schema.sql`, how to edit `sheet.json`.
- Deploy guide for Vercel or Netlify, including setting the env variables and the Supabase redirect URLs.
- Short test checklist: counts match, skip counted in total, guest progress survives refresh, merge works on first login, RLS blocks other users' rows.

## 14. Later (do not build now)

Per-problem notes, bookmarks, difficulty tags, per-row icons, daily streak, activity heatmap, direct LeetCode links through a lookup list.

## 15. Decisions already made (do not re-ask)

- Skipped problems are **counted** in the total (always 518).
- **Supabase** is used for login and database.
- One complete public site. There are no separate phases.
- **Look:** follows the reference screenshot (dark, flat, tree-connected sub-sections). **No** difficulty tags and **no** per-row icons (bookmark, notes, YouTube, links, menu). Only checkbox, title and Skip.
- The tick strip from the earlier idea is **dropped**. Use simple thin progress bars instead.