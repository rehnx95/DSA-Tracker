import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useProgress() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [progress, setProgress] = useState(() => {
    try {
      const stored = localStorage.getItem('dsa-progress');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const progressRef = useRef(progress);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const [activityLog, setActivityLog] = useState(() => {
    try {
      const stored = localStorage.getItem('dsa-activity-log');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // ===== AUTHENTICATION =====
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ===== DATA LOADING FROM SUPABASE =====
  useEffect(() => {
    if (user) {
      loadProgressFromSupabase();
      loadActivityFromSupabase();
      loadProfileFromSupabase();
    }
  }, [user]);

  const loadProgressFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('progress')
        .select('problem_id, state')
        .eq('user_id', user.id);

      if (error) throw error;

      const progressMap = {};
      data.forEach(item => {
        progressMap[item.problem_id] = item.state;
      });
      setProgress(progressMap);
    } catch (err) {
      console.error('Failed to load progress from Supabase:', err);
    }
  };

  const loadActivityFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('date, count')
        .eq('user_id', user.id);

      if (error) throw error;

      const activityMap = {};
      data.forEach(item => {
        activityMap[item.date] = item.count;
      });
      setActivityLog(activityMap);
    } catch (err) {
      console.error('Failed to load activity from Supabase:', err);
    }
  };

  const loadProfileFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, username, bio, location, website')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        // Update localStorage with profile data for UI components
        localStorage.setItem('dsa-user-name', data.name || '');
        localStorage.setItem('dsa-user-username', data.username || '');
        localStorage.setItem('dsa-user-bio', data.bio || '');
        localStorage.setItem('dsa-user-location', data.location || '');
        localStorage.setItem('dsa-user-website', data.website || '');
      }
    } catch (err) {
      console.error('Failed to load profile from Supabase:', err);
    }
  };

  // ===== PERSISTENCE =====
  useEffect(() => {
    // Save to localStorage only when not authenticated
    if (!user) {
      localStorage.setItem('dsa-progress', JSON.stringify(progress));
    }
  }, [progress, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('dsa-activity-log', JSON.stringify(activityLog));
    }
  }, [activityLog, user]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);

  // ===== CORE FUNCTIONS =====
  const update = useCallback(async (id, state) => {
    const currentState = progressRef.current[id];

    // Optimistic update for immediate UI response
    setProgress(p => ({ ...p, [id]: state }));

    const today = new Date().toISOString().split('T')[0];

    // Activity tracking with duplicate prevention
    if (state === 'done' && currentState !== 'done') {
      setActivityLog(log => ({
        ...log,
        [today]: (log[today] || 0) + 1
      }));
    } else if (currentState === 'done' && state !== 'done') {
      setActivityLog(log => {
        const current = log[today] || 0;
        if (current <= 0) return log;
        const newLog = { ...log, [today]: current - 1 };
        if (newLog[today] === 0) delete newLog[today];
        return newLog;
      });
    }

    // Save to Supabase if authenticated
    if (user) {
      try {
        // Update progress with upsert to handle both new and existing records
        const { error: progressError } = await supabase
          .from('progress')
          .upsert(
            { user_id: user.id, problem_id: id, state },
            { onConflict: 'user_id,problem_id' }
          );

        if (progressError) throw progressError;

        // Update activity log in Supabase
        if (state === 'done' && currentState !== 'done') {
          await supabase
            .from('activity_log')
            .upsert(
              { user_id: user.id, date: today, count: (activityLog[today] || 0) + 1 },
              { onConflict: 'user_id,date' }
            );
        } else if (currentState === 'done' && state !== 'done') {
          const newCount = Math.max(0, (activityLog[today] || 0) - 1);
          if (newCount > 0) {
            await supabase
              .from('activity_log')
              .upsert(
                { user_id: user.id, date: today, count: newCount },
                { onConflict: 'user_id,date' }
              );
          } else {
            await supabase
              .from('activity_log')
              .delete()
              .match({ user_id: user.id, date: today });
          }
        }
      } catch (err) {
        console.error('Failed to save to Supabase:', err);
        // Rollback optimistic update on error
        setProgress(p => {
          const newP = { ...p };
          delete newP[id];
          return newP;
        });
        setActivityLog(log => {
          const newLog = { ...log };
          if (today in newLog) {
            if (state === 'done' && currentState !== 'done') {
              if (newLog[today] > 0) newLog[today]--;
            } else if (currentState === 'done' && state !== 'done') {
              newLog[today]++;
            }
          }
          return newLog;
        });
      }
    }
  }, [user, activityLog]);

  const bulkUpdate = useCallback(async (newProgress) => {
    setProgress(newProgress);

    if (user) {
      try {
        // Delete existing progress and insert new
        const entries = Object.entries(newProgress).map(([problem_id, state]) => ({
          user_id: user.id,
          problem_id,
          state,
        }));

        if (entries.length > 0) {
          const { error } = await supabase
            .from('progress')
            .upsert(entries, { onConflict: 'user_id,problem_id' });

          if (error) throw error;
        }
      } catch (err) {
        console.error('Failed to bulk update progress in Supabase:', err);
      }
    }
  }, [user]);

  const getState = useCallback((id, defaultSkip) => {
    if (progress[id]) return progress[id];
    if (defaultSkip) return 'skipped';
    return 'todo';
  }, [progress]);

  const reset = useCallback(async () => {
    setProgress({});
    setActivityLog({});

    if (user) {
      try {
        await supabase.from('progress').delete().match({ user_id: user.id });
        await supabase.from('activity_log').delete().match({ user_id: user.id });
      } catch (err) {
        console.error('Failed to reset progress in Supabase:', err);
      }
    }
  }, [user]);

  const signIn = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    } catch (err) {
      console.error('Sign in error:', err);
      alert('Failed to sign in with Google');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProgress({});
      setActivityLog({});
    } catch (err) {
      console.error('Sign out error:', err);
      alert('Failed to sign out');
    }
  }, []);

  return {
    user,
    loading,
    progress,
    activityLog,
    update,
    bulkUpdate,
    getState,
    theme,
    setTheme,
    reset,
    signIn,
    signOut,
  };
}