-- Store converted custom sheets privately for each authenticated account.
CREATE TABLE IF NOT EXISTS public.user_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  source_name TEXT NOT NULL CHECK (char_length(source_name) BETWEEN 1 AND 255),
  sheet_data JSONB NOT NULL CHECK (
    jsonb_typeof(sheet_data) = 'object'
    AND jsonb_typeof(sheet_data->'steps') = 'array'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sheets_user_id_created_at_idx
  ON public.user_sheets (user_id, created_at);

ALTER TABLE public.user_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sheets_select_own ON public.user_sheets;
CREATE POLICY user_sheets_select_own ON public.user_sheets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_sheets_insert_own ON public.user_sheets;
CREATE POLICY user_sheets_insert_own ON public.user_sheets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_sheets TO authenticated;
