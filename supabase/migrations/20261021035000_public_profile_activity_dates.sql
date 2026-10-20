-- Keep public activity, streaks, and the client's local calendar aligned.
-- Older solved rows may have no completed_on value, so fall back to their
-- update date instead of silently omitting them from the public heatmap.
DROP FUNCTION IF EXISTS public.get_public_profile(TEXT);
DROP FUNCTION IF EXISTS public.get_public_profile(TEXT, DATE);

CREATE FUNCTION public.get_public_profile(
  requested_username TEXT,
  requested_today DATE
)
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
solved_dates AS (
  SELECT
    progress_row.user_id,
    COALESCE(
      progress_row.completed_on,
      (progress_row.updated_at AT TIME ZONE 'UTC')::DATE
    ) AS date
  FROM public.progress AS progress_row
  JOIN target_profile AS target ON target.id = progress_row.user_id
  WHERE progress_row.state = 'done'
),
active_dates AS (
  SELECT DISTINCT solved_dates.date
  FROM solved_dates
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
    WHEN EXISTS (
      SELECT 1 FROM active_dates WHERE date = requested_today
    ) THEN requested_today
    ELSE requested_today - 1
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
    sheet.id,
    sheet.title,
    sheet.created_at,
    jsonb_path_query_array(
      sheet.sheet_data,
      '$.steps[*].subsections[*].problems[*]'
    ) AS problems
  FROM public.user_sheets AS sheet
  JOIN target_profile AS target ON target.id = sheet.user_id
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
          JOIN target_profile AS target ON TRUE
          JOIN public.progress AS progress_row
            ON progress_row.user_id = target.id
           AND progress_row.problem_id =
             'custom-' || sheet.id::TEXT || '::' || problem.id
           AND progress_row.state = 'done'
        ),
        'skipped', (
          SELECT COUNT(*)::INTEGER
          FROM jsonb_to_recordset(sheet.problems)
            AS problem(id TEXT, "defaultSkip" BOOLEAN)
          JOIN target_profile AS target ON TRUE
          WHERE EXISTS (
            SELECT 1
            FROM public.progress AS progress_row
            WHERE progress_row.user_id = target.id
              AND progress_row.problem_id =
                'custom-' || sheet.id::TEXT || '::' || problem.id
              AND progress_row.state = 'skipped'
          ) OR (
            COALESCE(problem."defaultSkip", false)
            AND NOT EXISTS (
              SELECT 1
              FROM public.progress AS progress_row
              WHERE progress_row.user_id = target.id
                AND progress_row.problem_id =
                  'custom-' || sheet.id::TEXT || '::' || problem.id
            )
          )
        )
      )
      ORDER BY sheet.created_at
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
        'accepted_on', recent.accepted_on,
        'completed_at', recent.updated_at
      )
      ORDER BY recent.updated_at DESC
    ),
    '[]'::JSONB
  ) AS value
  FROM (
    SELECT
      problem.title AS problem_title,
      sheet.title AS sheet_title,
      COALESCE(
        progress_row.completed_on,
        (progress_row.updated_at AT TIME ZONE 'UTC')::DATE
      ) AS accepted_on,
      progress_row.updated_at
    FROM uploaded_sheets AS sheet
    CROSS JOIN LATERAL jsonb_to_recordset(sheet.problems)
      AS problem(id TEXT, title TEXT)
    JOIN target_profile AS target ON TRUE
    JOIN public.progress AS progress_row
      ON progress_row.user_id = target.id
     AND progress_row.problem_id =
       'custom-' || sheet.id::TEXT || '::' || problem.id
     AND progress_row.state = 'done'
    ORDER BY progress_row.updated_at DESC
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
        SELECT solved_dates.date, COUNT(*)::INTEGER AS count
        FROM solved_dates
        WHERE solved_dates.date BETWEEN requested_today - 370 AND requested_today
        GROUP BY solved_dates.date
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
          'completed_on', COALESCE(
            progress_row.completed_on,
            (progress_row.updated_at AT TIME ZONE 'UTC')::DATE
          ),
          'updated_at', progress_row.updated_at
        )
        ORDER BY progress_row.updated_at DESC
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

REVOKE ALL ON FUNCTION public.get_public_profile(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT, DATE) TO authenticated;
