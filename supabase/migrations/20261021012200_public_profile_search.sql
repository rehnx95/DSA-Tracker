-- Public profile discovery is limited to authenticated users and exposes only
-- profile fields and aggregate activity, never email addresses or raw progress.
CREATE OR REPLACE FUNCTION public.search_public_profiles(search_term TEXT)
RETURNS TABLE (name TEXT, username TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.name, p.username
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.onboarding_completed
    AND BTRIM(search_term) ~ '^[A-Za-z0-9-]{3,32}$'
    AND p.username ILIKE BTRIM(search_term) || '%'
  ORDER BY p.username
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(requested_username TEXT)
RETURNS TABLE (
  name TEXT,
  username TEXT,
  location TEXT,
  website TEXT,
  total_solved BIGINT,
  activity JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.name,
    p.username,
    p.location,
    p.website,
    (
      SELECT COUNT(*)
      FROM public.progress AS pr
      WHERE pr.user_id = p.id
        AND pr.state = 'done'
    ) AS total_solved,
    COALESCE(
      (
        SELECT jsonb_object_agg(a.date::TEXT, a.count)
        FROM public.activity_log AS a
        WHERE a.user_id = p.id
          AND a.count > 0
          AND a.date BETWEEN CURRENT_DATE - 370 AND CURRENT_DATE
      ),
      '{}'::JSONB
    ) AS activity
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.onboarding_completed
    AND LOWER(p.username) = LOWER(BTRIM(requested_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO authenticated;
