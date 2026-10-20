-- Add public-profile data needed to render the same progress sections shown 
-- on an account's own profile. Individual todo rows and uploaded sheet content 
-- remain private; only solved/skipped states, sheet summaries and activity are 
-- returned to authenticated callers.
DROP FUNCTION IF EXISTS public.get_public_profile(TEXT);

CREATE FUNCTION public.get_public_profile(requested_username TEXT)
RETURNS TABLE (
  name TEXT,
  username TEXT,
  location TEXT,
  website TEXT,
  total_solved BIGINT,
  activity JSONB,
  current_streak BIGINT,
  longest_streak BIGINT,
  progress JSONB,
  custom_sheets JSONB,
  custom_recent_accepted JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE target_profile AS (
  SELECT p.id, p.name, p.username, p.location, p.website
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.onboarding_completed
    AND LOWER(p.username) = LOWER(BTRIM(requested_username))
  LIMIT 1
),
active_dates AS (
  SELECT DISTINCT progress_row.completed_on AS date
  FROM public.progress AS progress_row
  JOIN target_profile AS p ON p.id = progress_row.user_id
  WHERE progress_row.state = 'done'
    AND progress_row.completed_on IS NOT NULL
),
streak_groups AS (
  SELECT date, date - ROW_NUMBER() OVER (ORDER BY date)::INTEGER AS group_id
  FROM active_dates
),
best_streak AS (
  SELECT COALESCE(MAX(day_count), 0)::BIGINT AS value
  FROM (
    SELECT COUNT(*) AS day_count
    FROM streak_groups
    GROUP BY group_id
  ) AS streak_lengths
),
streak_anchor AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM active_dates WHERE date = CURRENT_DATE) THEN CURRENT_DATE
    ELSE CURRENT_DATE - 1
  END AS date
),
current_streak_days(date) AS (
  SELECT anchor.date
  FROM streak_anchor AS anchor
  WHERE EXISTS (SELECT 1 FROM active_dates WHERE date = anchor.date)
  UNION ALL
  SELECT streak.date - 1
  FROM current_streak_days AS streak
  WHERE EXISTS (
    SELECT 1 FROM active_dates WHERE date = streak.date - 1
  )
),
current_streak AS (
  SELECT COUNT(*)::BIGINT AS value
  FROM current_streak_days
),
uploaded_sheets AS (
  SELECT
    s.id,
    s.title,
    s.created_at,
    jsonb_path_query_array(
      s.sheet_data,
      '$.steps[*].subsections[*].problems[*]'
    ) AS problems
  FROM public.user_sheets AS s
  JOIN target_profile AS p ON p.id = s.user_id
),
custom_sheet_summaries AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'title', sheet.title,
        'total', jsonb_array_length(sheet.problems),
        'solved', (
          SELECT COUNT(*)::INTEGER
          FROM jsonb_to_recordset(sheet.problems) AS problem(id TEXT)
          JOIN target_profile AS p ON TRUE
          JOIN public.progress AS progress ON progress.user_id = p.id
            AND progress.problem_id = 'custom-' || sheet.id::TEXT || '::' || problem.id
            AND progress.state = 'done'
        ),
        'skipped', (
          SELECT COUNT(*)::INTEGER
          FROM jsonb_to_recordset(sheet.problems) AS problem(id TEXT, "defaultSkip" BOOLEAN)
          JOIN target_profile AS p ON TRUE
          WHERE EXISTS (
            SELECT 1 FROM public.progress AS progress
            WHERE progress.user_id = p.id
              AND progress.problem_id = 'custom-' || sheet.id::TEXT || '::' || problem.id
              AND progress.state = 'skipped'
          ) OR (
            COALESCE(problem."defaultSkip", false)
            AND NOT EXISTS (
              SELECT 1 FROM public.progress AS progress
              WHERE progress.user_id = p.id
                AND progress.problem_id = 'custom-' || sheet.id::TEXT || '::' || problem.id
            )
          )
        )
      ) ORDER BY sheet.created_at
    ),
    '[]'::JSONB
  ) AS value
  FROM uploaded_sheets AS sheet
),
custom_recent AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'title', recent.problem_title,
        'sheet_title', recent.sheet_title,
        'accepted_on', recent.completed_on,
        'completed_at', recent.updated_at
      ) ORDER BY recent.updated_at DESC
    ),
    '[]'::JSONB
  ) AS value
  FROM (
    SELECT
      progress.problem_id,
      problem.title AS problem_title,
      sheet.title AS sheet_title,
      progress.completed_on,
      progress.updated_at
    FROM uploaded_sheets AS sheet
    CROSS JOIN LATERAL jsonb_to_recordset(sheet.problems) AS problem(id TEXT, title TEXT)
    JOIN target_profile AS p ON TRUE
    JOIN public.progress AS progress ON progress.user_id = p.id
      AND progress.problem_id = 'custom-' || sheet.id::TEXT || '::' || problem.id
      AND progress.state = 'done'
    ORDER BY progress.updated_at DESC
    LIMIT 8
  ) AS recent
)
SELECT
  target.name,
  target.username,
  target.location,
  target.website,
  (
    SELECT COUNT(*)::BIGINT
    FROM public.progress AS progress_row
    WHERE progress_row.user_id = target.id
      AND progress_row.state = 'done'
  ) AS total_solved,
  COALESCE(
    (
      SELECT jsonb_object_agg(activity.date::TEXT, activity.count)
      FROM (
        SELECT progress_row.completed_on AS date, COUNT(*)::INTEGER AS count
        FROM public.progress AS progress_row
        WHERE progress_row.user_id = target.id
          AND progress_row.state = 'done'
          AND progress_row.completed_on BETWEEN CURRENT_DATE - 370 AND CURRENT_DATE
        GROUP BY progress_row.completed_on
      ) AS activity
    ),
    '{}'::JSONB
  ) AS activity,
  (SELECT value FROM current_streak) AS current_streak,
  (SELECT value FROM best_streak) AS longest_streak,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'problem_id', progress_row.problem_id,
          'state', progress_row.state,
          'completed_on', progress_row.completed_on,
          'updated_at', progress_row.updated_at
        ) ORDER BY progress_row.updated_at DESC
      )
      FROM public.progress AS progress_row
      WHERE progress_row.user_id = target.id
        AND progress_row.state IN ('done', 'skipped')
        AND progress_row.problem_id NOT LIKE 'custom-%'
    ),
    '[]'::JSONB
  ) AS progress,
  (SELECT value FROM custom_sheet_summaries) AS custom_sheets,
  (SELECT value FROM custom_recent) AS custom_recent_accepted
FROM target_profile AS target;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO authenticated;
