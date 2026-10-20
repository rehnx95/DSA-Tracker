-- Support legacy generated usernames with a unique suffix while retaining
-- input validation and the bounded, prefix-only search result set.
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
    AND p.username ILIKE BTRIM(search_term) || '%'
  ORDER BY p.username
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO authenticated;
