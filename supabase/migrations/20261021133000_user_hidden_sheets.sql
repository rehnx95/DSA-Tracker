CREATE TABLE IF NOT EXISTS public.user_hidden_sheets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_id TEXT NOT NULL CHECK (sheet_id ~ '^[a-z0-9_-]{1,80}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sheet_id)
);

ALTER TABLE public.user_hidden_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_hidden_sheets_select_own ON public.user_hidden_sheets;
CREATE POLICY user_hidden_sheets_select_own ON public.user_hidden_sheets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_hidden_sheets_insert_own ON public.user_hidden_sheets;
CREATE POLICY user_hidden_sheets_insert_own ON public.user_hidden_sheets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_hidden_sheets_delete_own ON public.user_hidden_sheets;
CREATE POLICY user_hidden_sheets_delete_own ON public.user_hidden_sheets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.user_hidden_sheets TO authenticated;
