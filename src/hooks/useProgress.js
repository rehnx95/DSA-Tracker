import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useProgress(user) {
  const [progress, setProgress] = useState({});
  const progressRef = useRef(progress);
  const [activityLog, setActivityLog] = useState({});
  const activityRef = useRef(activityLog);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const writeQueue = useRef(Promise.resolve());

  const replaceProgress = useCallback((nextProgress) => {
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  const replaceActivity = useCallback((nextActivity) => {
    activityRef.current = nextActivity;
    setActivityLog(nextActivity);
  }, []);

  const save = useCallback((operation) => {
    const write = writeQueue.current.then(operation);
    writeQueue.current = write.catch((saveError) => {
      console.error('Failed to save user data to Supabase:', saveError);
      setError('Some changes could not be saved. Check your connection and reload to sync your account.');
    });
    return write.catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || !supabase) {
      replaceProgress({});
      replaceActivity({});
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');
    replaceProgress({});
    replaceActivity({});

    Promise.all([
      supabase.from('progress').select('problem_id, state').eq('user_id', user.id),
      supabase.from('activity_log').select('date, count').eq('user_id', user.id),
    ]).then(([progressResult, activityResult]) => {
      if (progressResult.error) throw progressResult.error;
      if (activityResult.error) throw activityResult.error;
      if (!active) return;

      const progressMap = {};
      for (const item of progressResult.data) {
        progressMap[item.problem_id] = item.state;
      }

      const activityMap = {};
      for (const item of activityResult.data) {
        activityMap[item.date] = item.count;
      }

      replaceProgress(progressMap);
      replaceActivity(activityMap);
    }).catch((loadError) => {
      if (!active) return;
      console.error('Failed to load user data from Supabase:', loadError);
      setError('Could not load your saved progress. Check your Supabase database setup and reload.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user, replaceActivity, replaceProgress]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);

  const persistActivity = async (userId, date) => {
    const count = activityRef.current[date] || 0;
    if (count > 0) {
      const { error: activityError } = await supabase
        .from('activity_log')
        .upsert({ user_id: userId, date, count }, { onConflict: 'user_id,date' });
      if (activityError) throw activityError;
    } else {
      const { error: activityError } = await supabase
        .from('activity_log')
        .delete()
        .match({ user_id: userId, date });
      if (activityError) throw activityError;
    }
  };

  const update = useCallback(async (id, state) => {
    if (!user || !supabase) return;

    const currentState = progressRef.current[id];
    const nextProgress = { ...progressRef.current, [id]: state };
    replaceProgress(nextProgress);

    const today = new Date().toISOString().split('T')[0];
    const activityDelta = (state === 'done' ? 1 : 0) - (currentState === 'done' ? 1 : 0);
    if (activityDelta !== 0) {
      const nextActivity = { ...activityRef.current };
      const nextCount = Math.max(0, (nextActivity[today] || 0) + activityDelta);
      if (nextCount > 0) nextActivity[today] = nextCount;
      else delete nextActivity[today];
      replaceActivity(nextActivity);
    }

    await save(async () => {
      const { error: progressError } = await supabase
        .from('progress')
        .upsert(
          { user_id: user.id, problem_id: id, state },
          { onConflict: 'user_id,problem_id' }
        );
      if (progressError) throw progressError;
      if (activityDelta !== 0) await persistActivity(user.id, today);
    });
  }, [user, replaceActivity, replaceProgress, save]);

  const bulkUpdate = useCallback(async (newProgress) => {
    if (!user || !supabase) return;

    const previousProgress = progressRef.current;
    const today = new Date().toISOString().split('T')[0];
    const todayDelta = Object.entries(newProgress).reduce((delta, [id, state]) => (
      delta + (state === 'done' ? 1 : 0) - (previousProgress[id] === 'done' ? 1 : 0)
    ), 0);
    const mergedProgress = { ...progressRef.current, ...newProgress };
    const entries = Object.entries(newProgress).map(([problem_id, state]) => ({
      user_id: user.id,
      problem_id,
      state,
    }));
    replaceProgress(mergedProgress);

    if (todayDelta !== 0) {
      const nextActivity = { ...activityRef.current };
      const nextCount = Math.max(0, (nextActivity[today] || 0) + todayDelta);
      if (nextCount > 0) nextActivity[today] = nextCount;
      else delete nextActivity[today];
      replaceActivity(nextActivity);
    }

    await save(async () => {
      if (entries.length > 0) {
        const { error: progressError } = await supabase
          .from('progress')
          .upsert(entries, { onConflict: 'user_id,problem_id' });
        if (progressError) throw progressError;
      }
      if (todayDelta !== 0) await persistActivity(user.id, today);
    });
  }, [user, replaceActivity, replaceProgress, save]);

  const getState = useCallback((id, defaultSkip) => {
    if (progress[id]) return progress[id];
    if (defaultSkip) return 'skipped';
    return 'todo';
  }, [progress]);

  const reset = useCallback(async () => {
    if (!user || !supabase) return;
    replaceProgress({});
    replaceActivity({});

    await save(async () => {
      const { error: progressError } = await supabase.from('progress').delete().match({ user_id: user.id });
      if (progressError) throw progressError;
      const { error: activityError } = await supabase.from('activity_log').delete().match({ user_id: user.id });
      if (activityError) throw activityError;
    });
  }, [user, replaceActivity, replaceProgress, save]);

  return {
    progress,
    activityLog,
    loading,
    error,
    setError,
    update,
    bulkUpdate,
    getState,
    theme,
    setTheme,
    reset,
  };
}
