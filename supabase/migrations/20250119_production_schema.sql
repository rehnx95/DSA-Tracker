-- =============================================================================
-- DSA Sheet Tracker - Production PostgreSQL Migration
-- =============================================================================
-- Run this in your Supabase SQL Editor (SQL Editor > New Query > Run All)
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROFILES TABLE
-- =============================================================================
DROP TABLE IF EXISTS profiles CASCADE;
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'New User',
  username TEXT UNIQUE NOT NULL,
  bio TEXT,
  location TEXT,
  website TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 2. PROGRESS TABLE
-- =============================================================================
DROP TABLE IF EXISTS progress CASCADE;
CREATE TABLE progress (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('todo', 'done', 'skipped')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);

-- =============================================================================
-- 3. ACTIVITY_LOG TABLE
-- =============================================================================
DROP TABLE IF EXISTS activity_log CASCADE;
CREATE TABLE activity_log (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- =============================================================================
-- 4. AUTO-PROFILE CREATION TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_username TEXT;
BEGIN
  -- Generate unique username from email
  new_username := split_part(NEW.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4);

  -- Ensure username is unique by checking existing profiles
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = new_username) LOOP
    new_username := split_part(NEW.email, '@', 1) || '_' || substr(md5(random()::text), 1, 6);
  END LOOP;

  -- Insert into profiles table
  INSERT INTO profiles (
    id,
    name,
    username,
    bio,
    location,
    website,
    onboarding_completed,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    new_username,
    '',
    '',
    '',
    false,
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_signup();

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read access, update only own
DROP POLICY IF EXISTS profiles_read_all ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS profiles_insert_own ON profiles;

CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Progress: Read and write only own
DROP POLICY IF EXISTS progress_user_read ON progress;
DROP POLICY IF EXISTS progress_user_write ON progress;

CREATE POLICY "progress_user_read" ON progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "progress_user_write" ON progress
  FOR ALL USING (auth.uid() = user_id);

-- Activity Log: Read and write only own
DROP POLICY IF EXISTS activity_user_read ON activity_log;
DROP POLICY IF EXISTS activity_user_write ON activity_log;

CREATE POLICY "activity_user_read" ON activity_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "activity_user_write" ON activity_log
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- =============================================================================
DROP INDEX IF EXISTS idx_progress_user_id;
DROP INDEX IF EXISTS idx_activity_user_id;
DROP INDEX IF EXISTS idx_activity_date;
DROP INDEX IF EXISTS idx_profiles_username;

CREATE INDEX idx_progress_user_id ON progress(user_id);
CREATE INDEX idx_activity_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_date ON activity_log(date);
CREATE INDEX idx_profiles_username ON profiles(username);

-- =============================================================================
-- 7. UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_progress_updated_at ON progress;
DROP TRIGGER IF EXISTS update_activity_updated_at ON activity_log;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_updated_at
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- SELECT 'profiles' as table_name, COUNT(*) as row_count FROM profiles;
-- SELECT 'progress' as table_name, COUNT(*) as row_count FROM progress;
-- SELECT 'activity_log' as table_name, COUNT(*) as row_count FROM activity_log;
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('profiles', 'progress', 'activity_log');
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE '%auth_user_created%';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Your Supabase database is now ready for the DSA Sheet Tracker!
-- Next: Configure environment variables and update React components.