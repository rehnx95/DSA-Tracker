import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, ChevronDown, ChevronRight, Sun, Moon, User, CheckSquare, SkipForward, X, Download, Upload, RefreshCcw, Menu, X as XIcon, Settings, LogOut, Bell, Calendar, Trophy, Target } from 'lucide-react';
import data from './data/sheet.json';

/* ===================== Hooks ===================== */
function useProgress() {
  const [progress, setProgress] = useState(() => {
    try {
      const stored = localStorage.getItem('dsa-progress');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Ref to always read latest progress in callbacks
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

  useEffect(() => {
    localStorage.setItem('dsa-progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('dsa-activity-log', JSON.stringify(activityLog));
  }, [activityLog]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);

  const update = useCallback((id, state) => {
    const currentState = progressRef.current[id];

    setProgress(p => ({ ...p, [id]: state }));

    const today = new Date().toISOString().split('T')[0];

    if (state === 'done' && currentState !== 'done') {
      setActivityLog(log => {
        const current = log[today] || 0;
        return { ...log, [today]: current + 1 };
      });
    }
    else if (currentState === 'done' && state !== 'done') {
      setActivityLog(log => {
        const current = log[today] || 0;
        if (current <= 0) return log;
        const newLog = { ...log, [today]: current - 1 };
        if (newLog[today] === 0) delete newLog[today];
        return newLog;
      });
    }
  }, []);

  const bulkUpdate = useCallback((newProgress) => {
    setProgress(newProgress);
  }, []);

  const getState = useCallback((id, defaultSkip) => {
    if (progress[id]) return progress[id];
    if (defaultSkip) return 'skipped';
    return 'todo';
  }, [progress]);

  const reset = useCallback(() => {
    setProgress({});
    setActivityLog({});
  }, []);

  return { progress, activityLog, update, bulkUpdate, getState, theme, setTheme, reset };
}

/* ===================== Components ===================== */
function ProgressBar({ done, total, colorClass = "bg-[#6D5BF6]" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full h-[3px] bg-[#26262F] rounded-full overflow-hidden flex-shrink-0" aria-label={`${pct}% complete`}>
      <div
        className={`${colorClass} h-full rounded-full transition-all duration-300 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ProblemRow({ prob, state, onToggle, onSkip }) {
  const isDone = state === 'done';
  const isSkip = state === 'skipped';

  return (
    <div
      className={`group flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors duration-200 ${isSkip ? 'opacity-50 bg-[#15151B]/40' : 'hover:bg-[#1C1C24]'}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(prob.id)}
        aria-label={isDone ? `Mark ${prob.title} as not done` : `Mark ${prob.title} as done`}
        className={`w-[22px] h-[22px] flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${isDone ? 'bg-[#22A559] border-[#22A559]' : 'border-[#6D5BF6]/60 bg-transparent hover:border-[#6D5BF6]'}`}
      >
        {isDone && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
            <path d="M2 7l3.5 3.5L12 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Title */}
      <button
        onClick={() => onToggle(prob.id)}
        className={`flex-1 text-left text-[15px] leading-snug transition-all duration-200 ${isDone ? 'line-through text-[#8A8A98]' : 'text-[#E8E8EE] hover:text-white'}`}
      >
        {prob.title}
      </button>

      {/* Skip toggle */}
      <button
        onClick={() => onSkip(prob.id)}
        aria-label={isSkip ? `Unskip ${prob.title}` : `Skip ${prob.title}`}
        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md transition-colors duration-200 ${isSkip ? 'text-[#E65100] bg-[#E65100]/10' : 'text-[#8A8A98] hover:text-[#E65100] hover:bg-[#E65100]/10'}`}
      >
        <SkipForward size={13} />
        <span>Skip</span>
      </button>
    </div>
  );
}

function SubSectionRow({ sub, stepId, expanded, onToggle, progressState, onToggleProb, onSkipProb, hideSkipped, filter }) {
  const done = sub.problems.filter(p => progressState(p.id) === 'done').length;
  const total = sub.problems.length;

  let visible = sub.problems;
  if (hideSkipped) {
    visible = visible.filter(p => progressState(p.id) !== 'skipped');
  }

  // Apply filter
  if (filter === 'done') {
    visible = visible.filter(p => progressState(p.id) === 'done');
  } else if (filter === 'skipped') {
    visible = visible.filter(p => progressState(p.id) === 'skipped');
  } else if (filter === 'todo') {
    visible = visible.filter(p => progressState(p.id) === 'todo');
  }

  return (
    <div className="ml-4 pl-3 border-l border-[#26262F]">
      <button
        onClick={() => onToggle(sub.id)}
        className="w-full flex items-center gap-2 py-2 text-sm group text-left hover:text-[#E8E8EE] transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium text-[#E8E8EE]">{sub.title}</span>
        <div className="flex-1 mx-2"><ProgressBar done={done} total={total} /></div>
        <span className="text-xs text-[#8A8A98] tabular-nums">{done}/{total}</span>
      </button>

      {expanded && (
        <div className="mt-2 mb-3 bg-[#15151B] rounded-xl border border-[#26262F] p-2">
          {visible.length > 0 ? (
            visible.map(p => (
              <ProblemRow
                key={p.id}
                prob={p}
                state={progressState(p.id)}
                onToggle={onToggleProb}
                onSkip={onSkipProb}
              />
            ))
          ) : (
            <div className="py-4 text-center text-xs text-[#8A8A98]">No problems match the filter</div>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, progressState, expandedSteps, onToggleStep, expandedSubs, onToggleSub, onToggleProb, onSkipProb, hideSkipped, filter }) {
  const done = step.subsections.reduce((sum, s) => sum + s.problems.filter(p => progressState(p.id) === 'done').length, 0);
  const total = step.subsections.reduce((sum, s) => sum + s.problems.length, 0);

  return (
    <div className="rounded-xl bg-[#15151B] border border-[#26262F] overflow-hidden mb-3">
      <button
        onClick={() => onToggleStep(step.id)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#1C1C24] transition-colors"
      >
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          {expandedSteps.has(step.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <h2 className="font-semibold text-[17px] text-[#E8E8EE] flex-1">{step.title}</h2>
        <div className="flex-1 mx-3 hidden md:block"><ProgressBar done={done} total={total} /></div>
        <span className="text-sm text-[#8A8A98] tabular-nums whitespace-nowrap">{done}/{total}</span>
      </button>

      <div className="px-4 pb-3">
        {expandedSteps.has(step.id) && step.subsections.map(sub => (
          <SubSectionRow
            key={sub.id}
            sub={sub}
            stepId={step.id}
            expanded={expandedSubs.has(sub.id)}
            onToggle={() => onToggleSub(sub.id)}
            progressState={progressState}
            onToggleProb={onToggleProb}
            onSkipProb={onSkipProb}
            hideSkipped={hideSkipped}
            filter={filter}
          />
        ))}
      </div>
    </div>
  );
}

/* ===================== Profile Page Component ===================== */
function ProfilePage({
  userName, setUserName,
  userEmail, setUserEmail,
  userId, setUserId,
  dailyStreak, heatmapData,
  exportProgress, importProgress,
  onBack
}) {
  return (
    <div className="min-h-screen transition-colors duration-300 font-sans">
      <header className="sticky top-0 z-50 bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 -ml-1 rounded-lg hover:bg-[#1C1C24] transition-colors text-[#E8E8EE]">
            <ChevronDown size={20} className="rotate-90" />
          </button>
          <h1 className="font-bold text-xl">My Profile</h1>
          <div className="flex-1" />
          <button className="p-2 rounded-lg hover:bg-[#1C1C24] transition-colors text-[#8A8A98]">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-[#6D5BF6] to-[#8B7CFD] flex items-center justify-center text-4xl font-bold text-white shadow-lg shadow-[#6D5BF6]/30">
            {userName.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-bold text-[#E8E8EE]">{userName || 'User Name'}</h1>
            <p className="text-[#8A8A98] mt-1">{userEmail || 'user@example.com'}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
              <span className="px-3 py-1 bg-[#15151B] border border-[#26262F] rounded-full text-xs text-[#8A8A98]">
                ID: {userId || 'Not set'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#15151B] rounded-xl border border-[#26262F] p-4">
            <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
              <Calendar size={16} />
              <span className="text-xs font-medium">Streak</span>
            </div>
            <div className="text-2xl font-bold text-[#FF6B35]">{dailyStreak}</div>
            <div className="text-xs text-[#8A8A98] mt-1">days</div>
          </div>
          <div className="bg-[#15151B] rounded-xl border border-[#26262F] p-4">
            <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
              <Trophy size={16} />
              <span className="text-xs font-medium">Rank</span>
            </div>
            <div className="text-2xl font-bold text-[#6D5BF6]">Novice</div>
            <div className="text-xs text-[#8A8A98] mt-1">Beginner tier</div>
          </div>
          <div className="bg-[#15151B] rounded-xl border border-[#26262F] p-4">
            <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
              <Target size={16} />
              <span className="text-xs font-medium">Problems</span>
            </div>
            <div className="text-2xl font-bold text-[#22A559]">128</div>
            <div className="text-xs text-[#8A8A98] mt-1">Solved</div>
          </div>
          <div className="bg-[#15151B] rounded-xl border border-[#26262F] p-4">
            <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
              <Bell size={16} />
              <span className="text-xs font-medium">Notifications</span>
            </div>
            <div className="text-2xl font-bold text-[#6D5BF6]">5</div>
            <div className="text-xs text-[#8A8A98] mt-1">Unread</div>
          </div>
        </div>

        {/* Activity Section */}
        <div className="bg-[#15151B] rounded-2xl border border-[#26262F] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#E8E8EE]">Activity Heatmap</h3>
            <div className="flex items-center gap-2 text-xs text-[#8A8A98]">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-zinc-800/30" />
                <div className="w-3 h-3 rounded-sm bg-emerald-900/40" />
                <div className="w-3 h-3 rounded-sm bg-emerald-700/60" />
                <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
                <div className="w-3 h-3 rounded-sm bg-emerald-400" />
              </div>
              <span>More</span>
            </div>
          </div>
          <div className="overflow-x-auto activity-scroll">
            <div className="flex gap-2 min-w-max">
              {heatmapData.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {week.map((day, dayIdx) => {
                    const intensityColors = [
                      'bg-zinc-800/30',
                      'bg-emerald-900/40',
                      'bg-emerald-700/60',
                      'bg-emerald-500/80',
                      'bg-emerald-400',
                    ];
                    return (
                      <div
                        key={dayIdx}
                        className={`w-3 h-3 rounded-sm ${intensityColors[day.intensity]} hover:ring-1 hover:ring-white/20 transition-all cursor-pointer`}
                        title={`${day.date.toLocaleDateString()}: ${day.count} problems`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[#8A8A98]">
            <span>Last 52 weeks</span>
            <span>Last updated today</span>
          </div>
        </div>

        {/* Account Settings */}
        <div className="bg-[#15151B] rounded-2xl border border-[#26262F] divide-y divide-[#26262F] mb-6">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-[#E8E8EE] mb-4">Account Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#8A8A98] mb-1.5">Full Name</label>
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2.5 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-[#E8E8EE] focus:border-[#6D5BF6] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8A8A98] mb-1.5">Email Address</label>
                <input
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="Enter your email"
                  type="email"
                  className="w-full px-4 py-2.5 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-[#E8E8EE] focus:border-[#6D5BF6] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8A8A98] mb-1.5">User ID</label>
                <input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter your user ID"
                  className="w-full px-4 py-2.5 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-[#E8E8EE] focus:border-[#6D5BF6] focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Backup & Security */}
        <div className="bg-[#15151B] rounded-2xl border border-[#26262F] divide-y divide-[#26262F]">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-[#E8E8EE] mb-4">Backup & Data</h3>
            <div className="space-y-3">
              <button
                onClick={exportProgress}
                className="w-full flex items-center justify-between p-3.5 rounded-lg hover:bg-[#1C1C24] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#6D5BF6]/20 flex items-center justify-center text-[#6D5BF6]">
                    <Download size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-[#E8E8EE]">Export Progress</div>
                    <div className="text-xs text-[#8A8A98]">Download your progress as JSON</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#8A8A98]" />
              </button>

              <button
                onClick={() => document.getElementById('import-file').click()}
                className="w-full flex items-center justify-between p-3.5 rounded-lg hover:bg-[#1C1C24] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#E65100]/20 flex items-center justify-center text-[#E65100]">
                    <Upload size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-[#E8E8EE]">Import Progress</div>
                    <div className="text-xs text-[#8A8A98]">Restore progress from backup</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#8A8A98]" />
              </button>

              <input id="import-file" type="file" accept=".json" className="hidden" onChange={importProgress} />

              <button
                onClick={() => { if (confirm('Reset all progress?')) setUserName(''); setUserEmail(''); setUserId(''); }}
                className="w-full flex items-center justify-between p-3.5 rounded-lg hover:bg-red-900/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-500">
                    <RefreshCcw size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-red-400">Reset Account</div>
                    <div className="text-xs text-[#8A8A98]">Clear all progress and personal data</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#8A8A98]" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ===================== Main App ===================== */
function MainApp({ progress, activityLog, update, bulkUpdate, getState, theme, setTheme, reset, userName, setUserName, userEmail, setUserEmail, userId, setUserId, dailyStreak, heatmapData }) {

  const { progress, activityLog, update, bulkUpdate, getState, theme, setTheme, reset } = useProgress();
  const [search, setSearch] = useState(() => {
    return localStorage.getItem('dsa-search') || '';
  });

  // UI state with localStorage persistence
  const [expandedSteps, setExpandedSteps] = useState(() => {
    try {
      const stored = localStorage.getItem('dsa-expanded-steps');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [expandedSubs, setExpandedSubs] = useState(() => {
    try {
      const stored = localStorage.getItem('dsa-expanded-subs');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [hideSkipped, setHideSkipped] = useState(() => {
    try {
      return localStorage.getItem('dsa-hide-skipped') === 'true';
    } catch {
      return false;
    }
  });

  const [activeFilter, setActiveFilter] = useState(() => {
    return localStorage.getItem('dsa-filter') || 'all';
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // User info with persistence
  const [userName, setUserName] = useState(() => localStorage.getItem('dsa-user-name') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('dsa-user-email') || '');
  const [userId, setUserId] = useState(() => localStorage.getItem('dsa-user-id') || '');

  // Persist UI state changes
  useEffect(() => {
    localStorage.setItem('dsa-expanded-steps', JSON.stringify([...expandedSteps]));
  }, [expandedSteps]);

  useEffect(() => {
    localStorage.setItem('dsa-expanded-subs', JSON.stringify([...expandedSubs]));
  }, [expandedSubs]);

  useEffect(() => {
    localStorage.setItem('dsa-hide-skipped', String(hideSkipped));
  }, [hideSkipped]);

  useEffect(() => {
    localStorage.setItem('dsa-filter', activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    localStorage.setItem('dsa-search', search);
  }, [search]);

  // Persist user info
  useEffect(() => { localStorage.setItem('dsa-user-name', userName); }, [userName]);
  useEffect(() => { localStorage.setItem('dsa-user-email', userEmail); }, [userEmail]);
  useEffect(() => { localStorage.setItem('dsa-user-id', userId); }, [userId]);

  // All sections/subsections start collapsed if nothing stored
  // (Empty set = all collapsed)

  const totalProblems = data.steps.reduce((sum, s) => sum + s.subsections.reduce((ss, sub) => ss + sub.problems.length, 0), 0);
  const doneCount = Object.values(progress).filter(s => s === 'done').length;
  const skippedCount = Object.values(progress).filter(s => s === 'skipped').length;
  const todoCount = totalProblems - doneCount - skippedCount;

  // Calculate daily streak
  const dailyStreak = useMemo(() => {
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    while (true) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (activityLog[dateStr] && activityLog[dateStr] > 0) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [activityLog]);

  // Generate heatmap data for last 52 weeks
  const heatmapData = useMemo(() => {
    const weeks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from 52 weeks ago
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (52 * 7));

    let currentDate = new Date(startDate);
    let weekArray = [];

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = activityLog[dateStr] || 0;

      weekArray.push({
        date: new Date(currentDate),
        count: count,
        intensity: count === 0 ? 0 : Math.min(4, Math.floor((count / 5) * 4) + 1)
      });

      if (weekArray.length === 7) {
        weeks.push([...weekArray]);
        weekArray = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (weekArray.length > 0) {
      weeks.push(weekArray);
    }

    return weeks;
  }, [activityLog]);

  const progressState = useCallback((id) => {
    const prob = data.steps.flatMap(s => s.subsections.flatMap(sub => sub.problems)).find(p => p.id === id);
    if (!prob) return 'todo';
    return getState(id, prob.defaultSkip);
  }, [getState]);

  const handleToggle = useCallback((id) => {
    const current = progressState(id);
    update(id, current === 'done' ? 'todo' : 'done');
  }, [progressState, update]);

  const handleSkip = useCallback((id) => {
    const current = progressState(id);
    update(id, current === 'skipped' ? 'todo' : 'skipped');
  }, [progressState, update]);

  const toggleStep = useCallback((id) => {
    setExpandedSteps(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const toggleSub = useCallback((id) => {
    setExpandedSubs(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const expandAll = useCallback(() => {
    const allSteps = new Set(data.steps.map(s => s.id));
    const allSubs = new Set(data.steps.flatMap(s => s.subsections.map(sub => sub.id)));
    setExpandedSteps(allSteps);
    setExpandedSubs(allSubs);
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
    setExpandedSubs(new Set());
  }, []);

  const filteredSteps = useMemo(() => {
    let result = data.steps;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.map(step => {
        const filteredSubs = step.subsections.map(sub => {
          const filteredProbs = sub.problems.filter(p => p.title.toLowerCase().includes(q));
          return { ...sub, problems: filteredProbs };
        }).filter(sub => sub.problems.length > 0);
        return { ...step, subsections: filteredSubs };
      }).filter(step => step.subsections.length > 0);
    }
    return result;
  }, [search]);

  // FIX #2: Export with problem titles instead of IDs for human readability
  const exportProgress = () => {
    const allProblems = data.steps.flatMap(s => s.subsections.flatMap(sub => sub.problems));
    const exportData = {};

    Object.entries(progress).forEach(([id, state]) => {
      // Only export done and skipped problems (not todo)
      if (state === 'done' || state === 'skipped') {
        const problem = allProblems.find(p => p.id === id);
        if (problem) {
          exportData[problem.title] = {
            id: id,
            state: state
          };
        }
      }
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dsa-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // FIX #3: Import with proper title-to-ID mapping and immediate state update
  const importProgress = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const fileContent = loadEvent.target.result;
        const imported = JSON.parse(fileContent);

        if (!imported || typeof imported !== 'object') {
          alert('Invalid backup file format - must be a JSON object');
          return;
        }

        // Convert imported title-based data to ID-based progress
        const newProgress = {};
        let importedCount = 0;

        for (const [title, value] of Object.entries(imported)) {
          // Handle new format with {id, state} object
          if (value && typeof value === 'object' && value.id && value.state) {
            const id = value.id;
            const state = value.state;

            // Only import done and skipped states
            if (state === 'done' || state === 'skipped') {
              newProgress[id] = state;
              importedCount++;
            }
          }
        }

        if (importedCount === 0) {
          alert('No valid problem states found in backup file');
          return;
        }

        // Immediately update state - this triggers re-render
        bulkUpdate(newProgress);
        alert(`Successfully imported ${importedCount} problem states`);
      } catch (err) {
        console.error('Import error details:', err);
        alert(`Failed to import backup file: ${err.message}`);
      }
    };

    reader.onerror = () => {
      alert('Failed to read backup file');
    };

    reader.readAsText(file);
  };

  // FIX #2: Filter chip styling helper
  const chipActive = (type) => activeFilter === type ? 'bg-[#6D5BF6] text-white' : 'bg-[#15151B] text-[#8A8A98] hover:text-white';

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans`} data-theme={theme === 'light' ? 'light' : undefined}>
      {/* FIX #4: Removed secondary progress bar beneath header */}
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-4">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-1.5 -ml-1 text-[#E8E8EE]" aria-label="Menu"><Menu size={22} /></button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6D5BF6] to-[#8B7CFD] flex items-center justify-center shadow-md shadow-[#6D5BF6]/20 flex-shrink-0">
              <CheckSquare size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight truncate">DSA Sheet</h1>
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative hidden sm:block">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search problems..."
              className="pl-8 pr-8 py-1.5 w-48 lg:w-72 bg-[#15151B] border border-[#26262F] rounded-lg text-sm text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:border-[#6D5BF6] transition-colors"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white"><X size={14} /></button>}
          </div>

          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" className="p-1.5 rounded-lg hover:bg-[#1C1C24] text-[#8A8A98] hover:text-[#E8E8EE] transition-colors">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button onClick={() => setShowProfile(true)} aria-label="Profile" className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6D5BF6]/20 to-[#8B7CFD]/30 border border-[#6D5BF6]/30 flex items-center justify-center hover:border-[#6D5BF6] transition-colors">
            <User size={14} className="text-[#6D5BF6]" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex gap-8 min-h-0">
        {/* Main column */}
        <section className="flex-1 min-w-0 overflow-y-auto pr-2" style={{maxHeight: 'calc(100vh - 120px)'}}>
          {/* FIX #2: Filter chips with single state variable */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {['all', 'done', 'skipped', 'todo'].map(type => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${chipActive(type)}`}
              >
                {type === 'all' ? 'All' : type === 'done' ? 'Done' : type === 'skipped' ? 'Skipped' : 'To do'}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-[#8A8A98] ml-2 cursor-pointer select-none">
              <input type="checkbox" checked={hideSkipped} onChange={e => setHideSkipped(e.target.checked)} className="w-3.5 h-3.5 rounded border-[#26262F] bg-[#15151B] accent-[#6D5BF6]" />
              Hide skipped
            </label>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 mb-4 text-xs text-[#8A8A98]">
            <button onClick={expandAll} className="hover:text-white transition-colors">Expand all</button>
            <span>·</span>
            <button onClick={collapseAll} className="hover:text-white transition-colors">Collapse all</button>
          </div>

          {/* Steps list */}
          <div>
            {filteredSteps.map(step => (
              <StepRow
                key={step.id}
                step={step}
                progressState={progressState}
                expandedSteps={expandedSteps}
                onToggleStep={toggleStep}
                expandedSubs={expandedSubs}
                onToggleSub={toggleSub}
                onToggleProb={handleToggle}
                onSkipProb={handleSkip}
                hideSkipped={hideSkipped}
                filter={activeFilter}
              />
            ))}
          </div>
        </section>

        {/* Sidebar (desktop) */}
        <aside className={`hidden lg:block w-72 flex-shrink-0 space-y-3 ${mobileOpen ? 'block fixed inset-0 z-[60] bg-[#0B0B0F]/95 backdrop-blur-xl p-6 overflow-y-auto' : ''}`}>
          {/* Progress card - Modern Dashboard Widget */}
          <div className="bg-[#15151B] rounded-2xl border border-[#26262F] p-6 relative">
            {/* Header */}
            <div className="mb-4">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Overall Progress</h3>
            </div>

            {/* Main Percentage Display */}
            <div className="mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white tabular-nums">
                  {totalProblems > 0 ? Math.round((doneCount / totalProblems) * 100) : 0}%
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {doneCount} / {totalProblems} problems solved
              </p>
            </div>

            {/* Progress Bar with Medal Badge */}
            <div className="relative mt-4">
              {/* Track */}
              <div className="h-2 bg-zinc-800 rounded-full overflow-visible relative">
                {/* Filled Progress */}
                <div
                  className="h-full bg-[#6D5BF6] rounded-full transition-all duration-500 ease-out relative"
                  style={{ width: `${totalProblems > 0 ? (doneCount / totalProblems) * 100 : 0}%` }}
                >
                  {/* Medal Badge */}
                  {doneCount > 0 && (
                    <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-300 rounded-full flex items-center justify-center shadow-lg">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-700">
                        <path d="M12 15l-3 5 3-1 3 1-3-5z" />
                        <circle cx="12" cy="8" r="6" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Row with Reset Button */}
            <div className="mt-5 pt-4 border-t border-zinc-800/50">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-white tabular-nums">{doneCount}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Done</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[#E65100] tabular-nums">{skippedCount}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Skipped</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white tabular-nums">{todoCount}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">To Do</div>
                </div>
              </div>
              <button
                onClick={() => { if (confirm('Reset all progress?')) reset(); }}
                className="w-full text-xs py-1.5 bg-[#1C1C24] hover:bg-red-900/30 text-[#8A8A98] hover:text-red-400 rounded-md transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCcw size={12} /> Reset All Progress
              </button>
            </div>
          </div>

          {/* Mobile close */}
          {mobileOpen && (
            <button onClick={() => setMobileOpen(false)} className="lg:hidden p-2 bg-[#15151B] rounded-lg text-[#E8E8EE] flex items-center gap-2"><XIcon size={16} /> Close</button>
          )}
        </aside>
      </main>

      {/* Profile Modal */}
      {profileOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setProfileOpen(false)}>
          <div className="bg-[#15151B] border border-[#26262F] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800/50 flex items-center justify-between">
              <h2 className="font-semibold text-lg">Profile</h2>
              <button onClick={() => setProfileOpen(false)} className="p-1 hover:bg-[#1C1C24] rounded-lg text-[#8A8A98] hover:text-white transition-colors">
                <XIcon size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* User Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-400">Your Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Name</label>
                    <input
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-3 py-2 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-white focus:border-[#6D5BF6] focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Email</label>
                    <input
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="Enter your email"
                      type="email"
                      className="w-full px-3 py-2 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-white focus:border-[#6D5BF6] focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">User ID</label>
                    <input
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Enter user ID"
                      className="w-full px-3 py-2 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-sm text-white focus:border-[#6D5BF6] focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-t border-zinc-800/50" />

              {/* Daily Streak */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-400">Daily Streak</span>
                  <div className="text-2xl">🔥</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-[#FF6B35] tabular-nums">{dailyStreak}</span>
                  <span className="text-sm text-zinc-500">days</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">Keep solving daily to maintain your streak!</p>
              </div>

              {/* Activity Heatmap */}
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-3">Activity</h4>
                <div className="overflow-x-auto activity-scroll pb-2">
                  <div className="flex gap-[2px] min-w-max">
                    {heatmapData.map((week, weekIdx) => (
                      <div key={weekIdx} className="flex flex-col gap-[2px]">
                        {week.map((day, dayIdx) => {
                          const intensityColors = [
                            'bg-zinc-800/30',           // 0 - no activity
                            'bg-emerald-900/40',        // 1 - low
                            'bg-emerald-700/60',        // 2 - medium
                            'bg-emerald-500/80',        // 3 - high
                            'bg-emerald-400',           // 4 - very high
                          ];
                          return (
                            <div
                              key={dayIdx}
                              className={`w-[10px] h-[10px] rounded-sm ${intensityColors[day.intensity]} hover:ring-1 hover:ring-white/20 transition-all cursor-pointer`}
                              title={`${day.date.toLocaleDateString()}: ${day.count} problems`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-sm bg-zinc-800/30" />
                    <div className="w-2 h-2 rounded-sm bg-emerald-900/40" />
                    <div className="w-2 h-2 rounded-sm bg-emerald-700/60" />
                    <div className="w-2 h-2 rounded-sm bg-emerald-500/80" />
                    <div className="w-2 h-2 rounded-sm bg-emerald-400" />
                  </div>
                  <span>More</span>
                </div>
              </div>

              {/* Backup Controls */}
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-3">Backup</h4>
                <div className="flex gap-2">
                  <button onClick={() => { exportProgress(); setProfileOpen(false); }} className="flex-1 text-sm py-2.5 bg-[#6D5BF6] hover:bg-[#5A4DE6] text-white rounded-md transition-colors flex items-center justify-center gap-2">
                    <Download size={14} /> Export
                  </button>
                  <button onClick={() => document.getElementById('import-file').click()} className="flex-1 text-sm py-2.5 bg-[#1C1C24] hover:bg-[#25252F] text-[#E8E8EE] rounded-md transition-colors flex items-center justify-center gap-2">
                    <Upload size={14} /> Import
                  </button>
                </div>
                <input id="import-file" type="file" accept=".json" className="hidden" onChange={importProgress} />
              </div>

              {/* Save Profile Button */}
              <button onClick={() => setProfileOpen(false)} className="w-full py-2.5 bg-[#6D5BF6] hover:bg-[#5A4DE6] text-white rounded-md font-medium transition-colors">
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
