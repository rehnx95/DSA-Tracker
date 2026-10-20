-- Auth user creation must not fail because of an optional user_settings row.
-- The app currently keeps UI preferences in localStorage and does not read this table.
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
BEGIN
  base_username := COALESCE(
    NULLIF(REGEXP_REPLACE(LOWER(SPLIT_PART(NEW.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), ''),
    'user'
  );

  INSERT INTO public.profiles (id, name, username, bio, location, website, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), NULLIF(SPLIT_PART(NEW.email, '@', 1), ''), 'User'),
    LEFT(base_username, 32) || '-' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 12),
    '',
    '',
    '',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
