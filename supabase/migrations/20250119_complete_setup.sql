-- =============================================================================
-- DSA Sheet Tracker Complete Database Setup
-- =============================================================================
-- Run this in your Supabase SQL Editor

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PROFILES TABLE
-- =============================================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  location TEXT,
  website TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles (for discovery)
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can only insert their own profile
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================================================
-- PROGRESS TABLE
-- =============================================================================
CREATE TABLE progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  problem_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('todo', 'done', 'skipped')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, problem_id)
);

-- RLS for progress
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

-- Users can only access their own progress
CREATE POLICY "progress_user_only" ON progress
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- ACTIVITY LOG TABLE
-- =============================================================================
CREATE TABLE activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, date)
);

-- RLS for activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Users can only access their own activity log
CREATE POLICY "activity_log_user_only" ON activity_log
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- USER SETTINGS TABLE (Optional - for future UI preferences)
-- =============================================================================
CREATE TABLE user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  theme TEXT DEFAULT 'dark',
  expanded_steps JSONB DEFAULT '[]'::jsonb,
  filter TEXT DEFAULT 'all',
  hide_skipped BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_user_only" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- AUTO PROFILE CREATION TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract user data from Google OAuth metadata if available
  DECLARE
    google_metadata JSONB := NEW.raw_user_meta_data;
    user_name TEXT;
    user_email TEXT;
  BEGIN
    -- Try to get name from Google metadata
    IF google_metadata IS NOT NULL AND google_metadata->>'full_name' IS NOT NULL THEN
      user_name := google_metadata->>'full_name';
    ELSIF google_metadata IS NOT NULL AND google_metadata->>'name' IS NOT NULL THEN
      user_name := google_metadata->>'name';
    ELSE
      -- Fallback to email prefix
      user_name := split_part(NEW.email, '@', 1);
    END IF;

    user_email := NEW.email;

    -- Generate unique username based on name
    DECLARE
      base_username TEXT := regexp_replace(lower(user_name), '[^a-z0-9]+', '-', 'g');
      final_username TEXT := base_username;
      counter INTEGER := 1;
    BEGIN
      -- Check if username exists and make unique
      WHILE EXISTS (SELECT 1 FROM profiles WHERE username = final_username) LOOP
        final_username := base_username || '-' || counter;
        counter := counter + 1;
      END LOOP;

      -- Insert profile record
      INSERT INTO public.profiles (id, name, username, bio, location, website, updated_at)
      VALUES (
        NEW.id,
        user_name,
        final_username,
        '', -- Empty bio for new users (onboarding will fill this)
        '', -- Empty location
        '', -- Empty website
        NOW()
      );
    END;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX progress_user_id_idx ON progress(user_id);
CREATE INDEX progress_problem_id_idx ON progress(problem_id);
CREATE INDEX activity_log_user_id_idx ON activity_log(user_id);
CREATE INDEX activity_log_date_idx ON activity_log(date);
CREATE INDEX profiles_username_idx ON profiles(username);

-- =============================================================================
-- FUNCTIONS FOR DATA MANAGEMENT
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_activity_log_updated_at
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =============================================================================
-- SEED DATA (Optional)
-- =============================================================================
-- You can run this after schema setup if needed
-- INSERT INTO profiles (id, name, username, bio, location, website, updated_at)
-- VALUES ('seed-uuid-here', 'Sample User', 'sample-user', 'Just getting started!', 'Somewhere', 'https://example.com', NOW());

-- =============================================================================
-- VERIFICATION QUERIES (Run to test setup)
-- =============================================================================
-- Test profiles table creation
-- SELECT 'profiles_table' AS table_name, COUNT(*) AS row_count FROM profiles;

-- Test progress table creation
-- SELECT 'progress_table' AS table_name, COUNT(*) AS row_count FROM progress;

-- Test activity_log table creation
-- SELECT 'activity_log_table' AS table_name, COUNT(*) AS row_count FROM activity_log;

-- Test user_settings table creation
-- SELECT 'user_settings_table' AS table_name, COUNT(*) AS row_count FROM user_settings;

-- Test RLS policy activation
-- SELECT schemaname, tablename, policyname, roles FROM pg_policies WHERE tablename IN ('profiles', 'progress', 'activity_log', 'user_settings');

-- Test trigger function
-- SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

COMMENT ON TABLE profiles IS 'User profile information for DSA Sheet Tracker';
COMMENT ON TABLE progress IS 'Problem progress tracking for each user';
COMMENT ON TABLE activity_log IS 'Daily activity counts for streak tracking';
COMMENT ON TABLE user_settings IS 'User interface preferences and settings';

-- =============================================================================
-- SETUP COMPLETE
-- =============================================================================
-- All tables created with proper RLS, indexes, and triggers.
-- Users can now sign up with Google OAuth and will automatically get a profile.
-- Run the verification queries above to confirm setup.