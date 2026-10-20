-- Keep live username lookup fast and prefix-only; return no more than five
-- public profile fields to authenticated callers.
CREATE INDEX IF NOT EXISTS profiles_username_lower_pattern_idx
  ON public.profiles (LOWER(username) text_pattern_ops)
  WHERE username IS NOT NULL;

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
    AND BTRIM(search_term) ~ '^[A-Za-z0-9-]{3,48}$'
    AND LOWER(p.username) LIKE LOWER(BTRIM(search_term)) || '%'
  ORDER BY p.username
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO authenticated;
