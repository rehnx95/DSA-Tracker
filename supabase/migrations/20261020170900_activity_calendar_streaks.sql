-- Store the local calendar date on which each problem was marked solved.
-- This lets activity remain attached to its original day when a problem is
-- later unmarked, and avoids UTC date shifts in the browser.

ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS completed_on DATE;

UPDATE public.progress
SET completed_on = (updated_at AT TIME ZONE 'UTC')::DATE
WHERE state = 'done' AND completed_on IS NULL;

UPDATE public.progress
SET completed_on = NULL
WHERE state <> 'done' AND completed_on IS NOT NULL;

-- Rebuild the tracker-generated activity counts from each user's current
-- solved problems so older UTC-shifted and incorrectly decremented counts
-- cannot keep streaks or heatmaps out of sync.
UPDATE public.activity_log
SET count = 0
WHERE count <> 0;

INSERT INTO public.activity_log (user_id, date, count)
SELECT user_id, completed_on, COUNT(*)::INTEGER
FROM public.progress
WHERE state = 'done' AND completed_on IS NOT NULL
GROUP BY user_id, completed_on
ON CONFLICT (user_id, date)
DO UPDATE SET count = EXCLUDED.count;
