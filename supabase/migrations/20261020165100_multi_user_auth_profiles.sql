-- Additive migration for Google OAuth onboarding and per-user cloud data.
-- Safe to apply over the earlier tracker schemas without dropping user data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  username TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.progress (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('todo', 'done', 'skipped')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  expanded_steps JSONB DEFAULT '[]'::JSONB,
  filter TEXT DEFAULT 'all',
  hide_skipped BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.profiles AS p
SET
  name = COALESCE(NULLIF(BTRIM(p.name), ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), NULLIF(u.raw_user_meta_data->>'name', ''), NULLIF(SPLIT_PART(u.email, '@', 1), ''), 'User'),
  username = COALESCE(NULLIF(BTRIM(p.username), ''), LEFT(COALESCE(NULLIF(REGEXP_REPLACE(LOWER(SPLIT_PART(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), ''), 'user'), 32) || '-' || LEFT(REPLACE(p.id::TEXT, '-', ''), 12)),
  bio = COALESCE(p.bio, ''),
  location = COALESCE(p.location, ''),
  website = COALESCE(p.website, ''),
  onboarding_completed = p.onboarding_completed OR (
    NULLIF(BTRIM(p.name), '') IS NOT NULL
    AND NULLIF(BTRIM(p.username), '') IS NOT NULL
    AND CHAR_LENGTH(BTRIM(COALESCE(p.bio, ''))) >= 10
  )
FROM auth.users AS u
WHERE u.id = p.id;

INSERT INTO public.profiles (id, name, username, bio, location, website, onboarding_completed)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), NULLIF(u.raw_user_meta_data->>'name', ''), NULLIF(SPLIT_PART(u.email, '@', 1), ''), 'User'),
  LEFT(COALESCE(NULLIF(REGEXP_REPLACE(LOWER(SPLIT_PART(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), ''), 'user'), 32) || '-' || LEFT(REPLACE(u.id::TEXT, '-', ''), 12),
  '',
  '',
  '',
  false
FROM auth.users AS u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

WITH duplicate_usernames AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY id) AS duplicate_number
  FROM public.profiles
  WHERE username IS NOT NULL
)
UPDATE public.profiles AS p
SET username = LEFT(REGEXP_REPLACE(LOWER(p.username), '[^a-z0-9-]+', '-', 'g'), 40) || '-' || REPLACE(p.id::TEXT, '-', '')
FROM duplicate_usernames AS d
WHERE d.id = p.id AND d.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_username_available(candidate_username TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE LOWER(username) = LOWER(candidate_username)
      AND id <> auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO authenticated;

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

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
DROP POLICY IF EXISTS profiles_read_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS progress_select_own ON public.progress;
CREATE POLICY progress_select_own ON public.progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_insert_own ON public.progress;
CREATE POLICY progress_insert_own ON public.progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_update_own ON public.progress;
CREATE POLICY progress_update_own ON public.progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_delete_own ON public.progress;
CREATE POLICY progress_delete_own ON public.progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS activity_select_own ON public.activity_log;
CREATE POLICY activity_select_own ON public.activity_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS activity_insert_own ON public.activity_log;
CREATE POLICY activity_insert_own ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS activity_update_own ON public.activity_log;
CREATE POLICY activity_update_own ON public.activity_log
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS activity_delete_own ON public.activity_log;
CREATE POLICY activity_delete_own ON public.activity_log
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_settings_access_own ON public.user_settings;
CREATE POLICY user_settings_access_own ON public.user_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS progress_user_id_idx ON public.progress(user_id);
CREATE INDEX IF NOT EXISTS activity_log_user_id_idx ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS activity_log_date_idx ON public.activity_log(date);
