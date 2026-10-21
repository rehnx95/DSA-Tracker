import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useProgress(user) {
  const [progress, setProgress] = useState({});
  const progressRef = useRef(progress);
  const completedOnRef = useRef({});
  const [completedOn, setCompletedOn] = useState({});
  const completedAtRef = useRef({});
  const [completedAt, setCompletedAt] = useState({});
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

  const replaceCompletedOn = useCallback((nextCompletedOn) => {
    completedOnRef.current = nextCompletedOn;
    setCompletedOn(nextCompletedOn);
  }, []);

  const replaceCompletedAt = useCallback((nextCompletedAt) => {
    completedAtRef.current = nextCompletedAt;
    setCompletedAt(nextCompletedAt);
  }, []);

  const save = useCallback((operation) => {
    const write = writeQueue.current.then(operation);
    writeQueue.current = write.catch((saveError) => {
      console.error('Failed to save user data to Supabase:', saveError);
      setError('Some changes could not be saved. Check your connection and reload to sync your account.');
    });
    return write.then(() => true, () => false);
  }, []);

  useEffect(() => {
    if (!user || !supabase) {
      replaceProgress({});
      replaceActivity({});
      replaceCompletedOn({});
      replaceCompletedAt({});
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');
    replaceProgress({});
    replaceActivity({});
    replaceCompletedOn({});
    replaceCompletedAt({});

    Promise.all([
      supabase.from('progress').select('problem_id, state, completed_on, updated_at').eq('user_id', user.id),
      supabase.from('activity_log').select('date, count').eq('user_id', user.id),
    ]).then(([progressResult, activityResult]) => {
      if (progressResult.error) throw progressResult.error;
      if (activityResult.error) throw activityResult.error;
      if (!active) return;

      const progressMap = {};
      const completedOnMap = {};
      const completedAtMap = {};
      for (const item of progressResult.data) {
        progressMap[item.problem_id] = item.state;
        if (item.state === 'done' && item.completed_on) {
          completedOnMap[item.problem_id] = item.completed_on;
        }
        if (item.state === 'done' && item.updated_at) {
          completedAtMap[item.problem_id] = item.updated_at;
        }
      }

      const activityMap = {};
      for (const item of activityResult.data) {
        activityMap[item.date] = item.count;
      }

      replaceProgress(progressMap);
      replaceActivity(activityMap);
      replaceCompletedOn(completedOnMap);
      replaceCompletedAt(completedAtMap);
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
  }, [user, replaceActivity, replaceCompletedAt, replaceCompletedOn, replaceProgress]);

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
    const currentCompletedOn = completedOnRef.current[id];
    const currentCompletedAt = completedAtRef.current[id];
    const today = getLocalDateKey();
    const now = new Date().toISOString();
    const nextProgress = { ...progressRef.current, [id]: state };
    const nextCompletedOn = { ...completedOnRef.current };
    const nextCompletedAt = { ...completedAtRef.current };
    if (state === 'done') nextCompletedOn[id] = currentState === 'done' ? currentCompletedOn || today : today;
    else delete nextCompletedOn[id];
    if (state === 'done') nextCompletedAt[id] = currentState === 'done' ? currentCompletedAt || now : now;
    else delete nextCompletedAt[id];
    replaceProgress(nextProgress);
    replaceCompletedOn(nextCompletedOn);
    replaceCompletedAt(nextCompletedAt);

    const deltas = {};
    if (currentState === 'done') {
      const date = currentCompletedOn || today;
      deltas[date] = (deltas[date] || 0) - 1;
    }
    if (state === 'done') {
      const date = nextCompletedOn[id];
      deltas[date] = (deltas[date] || 0) + 1;
    }
    const changedDates = Object.keys(deltas).filter(date => deltas[date] !== 0);
    if (changedDates.length > 0) {
      const nextActivity = { ...activityRef.current };
      for (const date of changedDates) {
        const count = Math.max(0, (nextActivity[date] || 0) + deltas[date]);
        if (count > 0) nextActivity[date] = count;
        else delete nextActivity[date];
      }
      replaceActivity(nextActivity);
    }

    await save(async () => {
      const { error: progressError } = await supabase
        .from('progress')
        .upsert(
          {
            user_id: user.id,
            problem_id: id,
            state,
            completed_on: state === 'done' ? nextCompletedOn[id] : null,
            updated_at: state === 'done' ? nextCompletedAt[id] : now,
          },
          { onConflict: 'user_id,problem_id' }
        );
      if (progressError) throw progressError;
      for (const date of changedDates) await persistActivity(user.id, date);
    });
  }, [user, replaceActivity, replaceCompletedAt, replaceCompletedOn, replaceProgress, save]);

  const bulkUpdate = useCallback(async (newProgress) => {
    if (!user || !supabase) return;

    const previousProgress = progressRef.current;
    const previousCompletedOn = completedOnRef.current;
    const previousCompletedAt = completedAtRef.current;
    const today = getLocalDateKey();
    const now = new Date().toISOString();
    const nextCompletedOn = { ...previousCompletedOn };
    const nextCompletedAt = { ...previousCompletedAt };
    const dateDeltas = {};
    for (const [id, state] of Object.entries(newProgress)) {
      const currentState = previousProgress[id];
      const oldDate = previousCompletedOn[id] || today;
      if (currentState === 'done') dateDeltas[oldDate] = (dateDeltas[oldDate] || 0) - 1;
      if (state === 'done') {
        nextCompletedOn[id] = currentState === 'done' ? oldDate : today;
        nextCompletedAt[id] = currentState === 'done' ? previousCompletedAt[id] || now : now;
        const newDate = nextCompletedOn[id];
        dateDeltas[newDate] = (dateDeltas[newDate] || 0) + 1;
      } else {
        delete nextCompletedOn[id];
        delete nextCompletedAt[id];
      }
    }
    const changedDates = Object.keys(dateDeltas).filter(date => dateDeltas[date] !== 0);
    const mergedProgress = { ...progressRef.current, ...newProgress };
    const entries = Object.entries(newProgress).map(([problem_id, state]) => ({
      user_id: user.id,
      problem_id,
      state,
      completed_on: state === 'done' ? nextCompletedOn[problem_id] : null,
      updated_at: state === 'done' ? nextCompletedAt[problem_id] : now,
    }));
    replaceProgress(mergedProgress);
    replaceCompletedOn(nextCompletedOn);
    replaceCompletedAt(nextCompletedAt);

    if (changedDates.length > 0) {
      const nextActivity = { ...activityRef.current };
      for (const date of changedDates) {
        const count = Math.max(0, (nextActivity[date] || 0) + dateDeltas[date]);
        if (count > 0) nextActivity[date] = count;
        else delete nextActivity[date];
      }
      replaceActivity(nextActivity);
    }

    return save(async () => {
      if (entries.length > 0) {
        const { error: progressError } = await supabase
          .from('progress')
          .upsert(entries, { onConflict: 'user_id,problem_id' });
        if (progressError) throw progressError;
      }
      for (const date of changedDates) await persistActivity(user.id, date);
    });
  }, [user, replaceActivity, replaceCompletedAt, replaceCompletedOn, replaceProgress, save]);

  const getState = useCallback((id, defaultSkip) => {
    if (progress[id]) return progress[id];
    if (defaultSkip) return 'skipped';
    return 'todo';
  }, [progress]);

  const reset = useCallback(async (problemIds, { persist = true } = {}) => {
    if (!user || !supabase) return;

    if (Array.isArray(problemIds)) {
      const idsToReset = [...new Set(problemIds)].filter(id => progressRef.current[id]);
      if (idsToReset.length === 0) return;

      const nextProgress = { ...progressRef.current };
      const nextCompletedOn = { ...completedOnRef.current };
      const nextCompletedAt = { ...completedAtRef.current };
      const dateDeltas = {};
      for (const id of idsToReset) {
        if (nextProgress[id] === 'done') {
          const date = nextCompletedOn[id] || getLocalDateKey();
          dateDeltas[date] = (dateDeltas[date] || 0) - 1;
        }
        delete nextProgress[id];
        delete nextCompletedOn[id];
        delete nextCompletedAt[id];
      }

      const changedDates = Object.keys(dateDeltas).filter(date => dateDeltas[date] !== 0);
      const nextActivity = { ...activityRef.current };
      for (const date of changedDates) {
        const count = Math.max(0, (nextActivity[date] || 0) + dateDeltas[date]);
        if (count > 0) nextActivity[date] = count;
        else delete nextActivity[date];
      }

      replaceProgress(nextProgress);
      replaceCompletedOn(nextCompletedOn);
      replaceCompletedAt(nextCompletedAt);
      if (changedDates.length > 0) replaceActivity(nextActivity);

      if (!persist) return;

      await save(async () => {
        const { error: progressError } = await supabase
          .from('progress')
          .delete()
          .eq('user_id', user.id)
          .in('problem_id', idsToReset);
        if (progressError) throw progressError;
        for (const date of changedDates) await persistActivity(user.id, date);
      });
      return;
    }

    replaceProgress({});
    replaceActivity({});
    replaceCompletedOn({});
    replaceCompletedAt({});

    await save(async () => {
      const { error: progressError } = await supabase.from('progress').delete().match({ user_id: user.id });
      if (progressError) throw progressError;
      const { error: activityError } = await supabase.from('activity_log').delete().match({ user_id: user.id });
      if (activityError) throw activityError;
    });
  }, [user, replaceActivity, replaceCompletedAt, replaceCompletedOn, replaceProgress, save]);

  return {
    progress,
    activityLog,
    completedOn,
    completedAt,
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
