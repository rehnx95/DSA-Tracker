CREATE OR REPLACE FUNCTION public.delete_user_sheet(requested_sheet_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed_sheet_data JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to remove a sheet.';
  END IF;

  DELETE FROM public.user_sheets
  WHERE id = requested_sheet_id
    AND user_id = auth.uid()
  RETURNING sheet_data INTO removed_sheet_data;

  IF removed_sheet_data IS NULL THEN
    RETURN FALSE;
  END IF;

  WITH deleted_progress AS (
    DELETE FROM public.progress AS progress_row
    WHERE progress_row.user_id = auth.uid()
      AND progress_row.problem_id IN (
        SELECT
          'custom-' || requested_sheet_id::TEXT || '::' || (problem.value->>'id')
        FROM jsonb_array_elements(
          COALESCE(removed_sheet_data->'steps', '[]'::JSONB)
        ) AS step(value)
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(step.value->'subsections', '[]'::JSONB)
        ) AS subsection(value)
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(subsection.value->'problems', '[]'::JSONB)
        ) AS problem(value)
        WHERE problem.value ? 'id'
      )
    RETURNING state, completed_on, updated_at
  ),
  date_deltas AS (
    SELECT
      COALESCE(completed_on, (updated_at AT TIME ZONE 'UTC')::DATE) AS activity_date,
      COUNT(*)::INTEGER AS completed_count
    FROM deleted_progress
    WHERE state = 'done'
    GROUP BY 1
  )
  UPDATE public.activity_log AS activity
  SET
    count = GREATEST(activity.count - date_deltas.completed_count, 0),
    updated_at = NOW()
  FROM date_deltas
  WHERE activity.user_id = auth.uid()
    AND activity.date = date_deltas.activity_date;

  DELETE FROM public.activity_log
  WHERE user_id = auth.uid()
    AND count = 0;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_sheet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_sheet(UUID) TO authenticated;
