import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  User,
  CheckSquare,
  SkipForward,
  X,
  Download,
  Upload,
  RefreshCcw,
  Menu,
  Settings,
  Calendar,
  Trophy,
  Target,
  LogOut,
  BookOpen,
  Users,
  Link2,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { useProgress } from "./hooks/useProgress";
import ProfileSettings from "./components/ProfileSettings";
import {
  countSheetProblems,
  parseSheet,
  sampleSheetTemplate,
} from "./utils/parseSheet";

const sheetModules = import.meta.glob("./data/*.json", {
  eager: true,
  import: "default",
});
const builtInSheets = Object.entries(sheetModules)
  .filter(([, sheet]) => Array.isArray(sheet?.steps))
  .map(([filePath, sheet]) => {
    const id = filePath
      .split("/")
      .pop()
      .replace(/\.json$/i, "");
    return {
      id,
      title:
        id === "dsa"
          ? "DSA Sheet"
          : id
              .replace(/[_-]+/g, " ")
              .replace(/\b\w/g, (character) => character.toUpperCase()),
      sheet,
      problemCount: sheet.steps.reduce(
        (total, step) =>
          total +
          step.subsections.reduce(
            (subTotal, subsection) => subTotal + subsection.problems.length,
            0,
          ),
        0,
      ),
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));
const defaultSheetId =
  builtInSheets.find((sheet) => sheet.id === "dsa")?.id || builtInSheets[0]?.id;

// =============================================================================
// Authentication Routing State Machine
// =============================================================================
const AppState = {
  LOADING: "LOADING",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  ONBOARDING: "ONBOARDING",
  AUTHENTICATED: "AUTHENTICATED",
};

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getActivityLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function getPeopleRoute(pathname = window.location.pathname) {
  if (pathname === "/people") return { page: "people", username: "" };
  const profileMatch = pathname.match(
    /^\/(?:user|u)\/([A-Za-z0-9-]{3,48})\/?$/,
  );
  if (profileMatch)
    return { page: "profile", username: profileMatch[1].toLowerCase() };
  return { page: "tracker", username: "" };
}

function App() {
  const [appState, setAppState] = useState(AppState.LOADING);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authEventOccurred = useRef(false);

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError) {
      setAuthError(
        oauthError === "server_error"
          ? "Google sign-in failed while creating your account. Please apply the latest Supabase database migration and try again."
          : "Google sign-in could not be completed. Please try again.",
      );
    }

    if (!isSupabaseConfigured) {
      setAuthError(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.",
      );
      setAppState(AppState.UNAUTHENTICATED);
      return undefined;
    }

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event === "INITIAL_SESSION") return;
      if (event === "TOKEN_REFRESHED") return;
      authEventOccurred.current = true;
      setAuthError("");
      setUser(session?.user ?? null);
      if (!session) {
        setProfile(null);
        setAppState(AppState.UNAUTHENTICATED);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!active || authEventOccurred.current) return;
        if (error) throw error;
        setUser(session?.user ?? null);
        if (!session) setAppState(AppState.UNAUTHENTICATED);
      })
      .catch((error) => {
        if (!active || authEventOccurred.current) return;
        console.error("Failed to restore authentication session:", error);
        setAuthError(
          "Could not restore your session. Please refresh and try again.",
        );
        setAppState(AppState.UNAUTHENTICATED);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !supabase) return undefined;

    let active = true;
    setAppState(AppState.LOADING);
    supabase
      .from("profiles")
      .select("id, name, username, location, website, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data: profileData, error }) => {
        if (!active) return;
        if (error) throw error;
        setProfile(profileData);
        setAppState(
          profileData?.onboarding_completed
            ? AppState.AUTHENTICATED
            : AppState.ONBOARDING,
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to fetch profile:", error);
        setAuthError(
          "Could not load your profile. Check the Supabase database setup and try again.",
        );
        setAppState(AppState.UNAUTHENTICATED);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleSignIn = async () => {
    if (!supabase) return;
    setIsSigningIn(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setAuthError(
        "Google sign-in could not be started. Check the Google provider settings in Supabase and try again.",
      );
      setIsSigningIn(false);
    }
  };

  const handleSignOut = useCallback(async () => {
    try {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Sign out error:", error);
      setAuthError("Could not sign out. Please try again.");
    }
  }, []);

  // =======================================================================
  // Render: Unauthenticated State
  // =======================================================================
  if (appState === AppState.UNAUTHENTICATED) {
    return (
      <UnauthenticatedView
        onSignIn={handleSignIn}
        isSigningIn={isSigningIn}
        error={authError}
      />
    );
  }

  // =======================================================================
  // Render: Onboarding State
  // =======================================================================
  if (appState === AppState.ONBOARDING && user) {
    return (
      <OnboardingPage
        user={user}
        profile={profile}
        onComplete={(savedProfile) => {
          setProfile(savedProfile);
          setAppState(AppState.AUTHENTICATED);
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  // =======================================================================
  // Render: Loading State
  // =======================================================================
  if (appState === AppState.LOADING) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[#6D5BF6] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#8A8A98]">Loading...</p>
        </div>
      </div>
    );
  }

  // =======================================================================
  // Render: Authenticated State
  // =======================================================================
  return (
    <AuthenticatedApp
      user={user}
      profile={profile}
      authError={authError}
      onProfileUpdated={setProfile}
      onSignOut={handleSignOut}
    />
  );
}

// =============================================================================
// Unauthenticated View Component
// =============================================================================
function UnauthenticatedView({ onSignIn, isSigningIn, error }) {
  return (
    <div className="auth-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans">
      <div className="auth-layout">
        <section className="auth-panel-wrap">
          <div className="auth-panel">
            <div className="brand-mark auth-mobile-mark">
              <CheckSquare size={20} className="text-white" />
            </div>
            <span className="section-kicker">DSA TRACKER</span>
            <h2>Sign in to continue</h2>
            <p className="auth-panel-description">
              Sign in to access your sheets and saved progress.
            </p>
            {error && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}
            <button
              onClick={onSignIn}
              disabled={isSigningIn}
              className="google-signin-button"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isSigningIn ? "Connecting to Google…" : "Continue with Google"}
              {!isSigningIn && <ChevronRight size={17} />}
            </button>
            <div className="auth-divider">
              <span>SECURE ACCOUNT ACCESS</span>
            </div>
            <p className="auth-legal">
              Your account securely syncs your profile and progress.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// Onboarding Page Component
// =============================================================================
function OnboardingPage({ user, profile, onComplete, onSignOut }) {
  const [formData, setFormData] = useState({
    name:
      profile?.name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "",
    username: profile?.username || "",
    location: profile?.location || "",
    website: profile?.website || "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [validationMessage, setValidationMessage] = useState("");

  // Check username availability in real-time
  useEffect(() => {
    if (!formData.username || formData.username.length < 3) {
      setUsernameAvailable(null);
      setValidationMessage("");
      return;
    }

    setUsernameAvailable(null);
    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("is_username_available", {
          candidate_username: formData.username,
        });
        if (error) throw error;
        if (!active) return;

        setUsernameAvailable(data);
        setValidationMessage(data ? "" : "This username is already taken");
      } catch (error) {
        console.error("Username availability check failed:", error);
        if (!active) return;
        setUsernameAvailable(null);
        setValidationMessage(
          "Could not check username availability. You can still try saving it.",
        );
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [formData.username, user.id]);

  const validateUsername = (username) => {
    if (username.length < 3) return "Username must be at least 3 characters";
    if (username.includes(" ")) return "Username cannot contain spaces";
    if (!/^(?=.*[a-z0-9])[a-z0-9-]+$/.test(username))
      return "Username must contain a letter or number and use only lowercase letters, numbers, and hyphens";
    return null;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === "username" ? value.toLowerCase().trim() : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));

    // Auto-generate username from name
    if (name === "name" && !formData.username) {
      const generatedUsername = nextValue
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (generatedUsername) {
        setFormData((prev) => ({ ...prev, username: generatedUsername }));
      }
    }

    // Clear errors
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    const usernameError = validateUsername(formData.username);
    if (usernameError) newErrors.username = usernameError;
    else if (usernameAvailable === false)
      newErrors.username = "Username is already taken";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      // Update profile
      const { data: savedProfile, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            name: formData.name.trim(),
            username: formData.username.trim().toLowerCase(),
            location: formData.location.trim(),
            website: formData.website.trim(),
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("id, name, username, location, website, onboarding_completed")
        .single();

      if (error) throw error;

      onComplete(savedProfile);
    } catch (error) {
      console.error("Onboarding error:", error);
      setErrors({
        submit:
          error.code === "23505"
            ? "That username was just taken. Please choose another one."
            : "Failed to save your profile. Check your connection and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="profile-settings-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans flex flex-col">
      {/* Header */}
      <header className="dashboard-header bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6D5BF6] to-[#8B7CFD] flex items-center justify-center">
              <CheckSquare size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-lg">Complete Your Profile</h1>
          </div>
          <button
            onClick={onSignOut}
            className="text-[#8A8A98] hover:text-[#E8E8EE] flex items-center gap-2 text-sm"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto px-4 md:px-6 py-8">
        <div className="onboarding-panel bg-[#15151B] rounded-2xl border border-[#26262F] p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">
              Welcome to DSA Sheet Tracker
            </h2>
            <p className="text-[#8A8A98]">
              Let's set up your profile to get started with tracking your coding
              journey.
            </p>
          </div>

          {errors.submit && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-6 text-red-400 text-sm">
              {errors.submit}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Full Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]"
                />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all"
                />
              </div>
              {errors.name && (
                <p className="text-red-400 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            {/* Username Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Username (Handle) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]"
                />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="johndoe"
                  className={`w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 transition-all ${
                    usernameAvailable === true
                      ? "border-green-500 focus:ring-green-500"
                      : usernameAvailable === false
                        ? "border-red-500 focus:ring-red-500"
                        : "border-[#26262F] focus:ring-[#6D5BF6]"
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {usernameAvailable === true && (
                    <span className="text-green-400 text-xs flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                      Available
                    </span>
                  )}
                  {usernameAvailable === false && (
                    <span className="text-red-400 text-xs flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-red-500 rounded-full" />
                      Taken
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-[#8A8A98] mt-1">
                3+ characters, lowercase letters, numbers, and hyphens only
              </p>
              <p
                className={`text-sm mt-1 ${validationMessage ? "text-red-400" : "text-[#8A8A98]"}`}
              >
                {validationMessage}
              </p>
            </div>

            {/* Location Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Location
              </label>
              <div className="relative">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="New York, USA"
                  className="w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Website Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Website / Portfolio
              </label>
              <div className="relative">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://johndoe.dev"
                  className="w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading || usernameAvailable === false}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[#6D5BF6] hover:bg-[#5B4AD6] disabled:bg-[#26262F] disabled:text-[#8A8A98] disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:ring-offset-2 focus:ring-offset-[#0B0B0F] shadow-lg shadow-[#6D5BF6]/20"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Creating Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Setup</span>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// Authenticated App Component (Main DSA Tracker)
// =============================================================================
function AuthenticatedApp({
  user,
  profile,
  authError,
  onProfileUpdated,
  onSignOut,
}) {
  const {
    progress,
    activityLog,
    completedOn,
    completedAt,
    loading: progressLoading,
    error: progressError,
    setError: setProgressError,
    update,
    bulkUpdate,
    getState,
    theme,
    setTheme,
    reset,
  } = useProgress(user);

  const [customSheets, setCustomSheets] = useState([]);
  const [customSheetsLoading, setCustomSheetsLoading] = useState(true);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [todayDateKey, setTodayDateKey] = useState(() =>
    getLocalDateKey(new Date()),
  );
  const uploadSheetInput = useRef(null);
  const availableSheets = useMemo(
    () =>
      [...builtInSheets, ...customSheets].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    [customSheets],
  );
  const savedSheetIdRef = useRef(localStorage.getItem("dsa-active-sheet"));
  const [selectedSheetId, setSelectedSheetId] = useState(() => {
    const savedSheetId = savedSheetIdRef.current;
    return builtInSheets.some((sheet) => sheet.id === savedSheetId)
      ? savedSheetId
      : defaultSheetId;
  });
  const [sheetSidebarOpen, setSheetSidebarOpen] = useState(false);
  const [search, setSearch] = useState(
    () => localStorage.getItem("dsa-search") || "",
  );
  const [expandedSteps, setExpandedSteps] = useState(() => {
    try {
      const stored = localStorage.getItem("dsa-expanded-steps");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [expandedSubs, setExpandedSubs] = useState(() => {
    try {
      const stored = localStorage.getItem("dsa-expanded-subs");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [hideSkipped, setHideSkipped] = useState(() => {
    try {
      return localStorage.getItem("dsa-hide-skipped") === "true";
    } catch {
      return false;
    }
  });
  const [activeFilter, setActiveFilter] = useState(
    () => localStorage.getItem("dsa-filter") || "all",
  );
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [peopleSearchPage, setPeopleSearchPage] = useState(
    () => getPeopleRoute().page === "people",
  );
  const [profileSearchOpen, setProfileSearchOpen] = useState(
    () => getPeopleRoute().page === "people",
  );
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [profileSearchResults, setProfileSearchResults] = useState([]);
  const [profileSearchLoading, setProfileSearchLoading] = useState(false);
  const [profileSearchError, setProfileSearchError] = useState("");
  const [selectedPublicUsername, setSelectedPublicUsername] = useState(
    () => getPeopleRoute().username,
  );
  const [publicProfile, setPublicProfile] = useState(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState("");
  const publicProfileReturnPath = useRef(
    getPeopleRoute().page === "people" ? "/people" : "/",
  );
  const [copiedProfileLink, setCopiedProfileLink] = useState(false);
  const [backupAction, setBackupAction] = useState("");
  const importSheetId = useRef(null);
  const importFileInput = useRef(null);

  useEffect(() => {
    const handlePopState = () => {
      const route = getPeopleRoute();
      setPeopleSearchPage(route.page === "people");
      setProfileSearchOpen(route.page === "people");
      setSelectedPublicUsername(route.username);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    const route = getPeopleRoute(path);
    setPeopleSearchPage(route.page === "people");
    setProfileSearchOpen(route.page === "people");
    setSelectedPublicUsername(route.username);
  };

  const openPeopleSearch = () => {
    publicProfileReturnPath.current = "/people";
    setProfileSearchQuery("");
    setProfileSearchResults([]);
    navigateTo("/people");
  };
  useEffect(() => {
    const query = profileSearchQuery.trim();
    if (!profileSearchOpen || query.length < 3) {
      setProfileSearchResults([]);
      setProfileSearchError("");
      setProfileSearchLoading(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setProfileSearchLoading(true);
    setProfileSearchError("");
    const timer = window.setTimeout(async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) throw new Error("Sign in to search users.");

        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            signal: controller.signal,
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not search users.");
        if (active) setProfileSearchResults(result.results || []);
      } catch (error) {
        if (!active || error.name === "AbortError") return;
        console.error("Failed to search public profiles:", error);
        setProfileSearchError(
          error.message || "Could not search profiles. Please try again.",
        );
      } finally {
        if (active) setProfileSearchLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [profileSearchOpen, profileSearchQuery]);

  useEffect(() => {
    if (!selectedPublicUsername) {
      setPublicProfile(null);
      setPublicProfileError("");
      return undefined;
    }

    let active = true;
    let requestInFlight = false;
    setPublicProfile(null);
    setPublicProfileLoading(true);
    setPublicProfileError("");
    const refreshPublicProfile = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      try {
        const { data, error } = await supabase.rpc("get_public_profile", {
          requested_username: selectedPublicUsername,
          requested_today: getLocalDateKey(new Date()),
        });
        if (error) throw error;
        if (!active) return;
        const profileData = data?.[0];
        if (!profileData) {
          setPublicProfile(null);
          setPublicProfileError("This profile could not be found.");
          return;
        }
        setPublicProfile(profileData);
        setPublicProfileError("");
      } catch (error) {
        if (!active) return;
        console.error("Failed to load public profile:", error);
        setPublicProfileError(
          "Could not load this profile. Apply the latest public profile migrations and try again.",
        );
      } finally {
        requestInFlight = false;
        if (active) setPublicProfileLoading(false);
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshPublicProfile();
    };
    refreshPublicProfile();
    const refreshTimer = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshPublicProfile);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshPublicProfile);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [selectedPublicUsername]);

  const openPublicProfile = (username) => {
    publicProfileReturnPath.current = "/people";
    setProfileSearchQuery("");
    setProfileSearchResults([]);
    navigateTo(`/user/${encodeURIComponent(username)}`);
  };

  const returnFromPublicProfile = () => {
    navigateTo(publicProfileReturnPath.current || "/");
  };

  const copyPublicProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedProfileLink(true);
      window.setTimeout(() => setCopiedProfileLink(false), 1800);
    } catch (error) {
      console.error("Could not copy the public profile link:", error);
      setPublicProfileError(
        "Could not copy the link. Copy the profile URL from your browser address bar.",
      );
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTodayDateKey(current => {
        const today = getLocalDateKey(new Date());
        return current === today ? current : today;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from("user_sheets")
      .select("id, title, source_name, sheet_data, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        if (!active) return;
        const loadedSheets = data.map((row) => ({
          id: `custom-${row.id}`,
          customId: row.id,
          title: row.title,
          sourceName: row.source_name,
          sheet: row.sheet_data,
          problemCount: countSheetProblems(row.sheet_data),
        }));
        setCustomSheets(loadedSheets);
        const savedSheetId = savedSheetIdRef.current;
        if (loadedSheets.some((sheet) => sheet.id === savedSheetId))
          setSelectedSheetId(savedSheetId);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to load uploaded sheets:", error);
        setSheetError(
          "Could not load your uploaded sheets. Check that the user_sheets migration is applied.",
        );
      })
      .finally(() => {
        if (active) setCustomSheetsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const selectedSheet =
    availableSheets.find((sheet) => sheet.id === selectedSheetId) ||
    availableSheets[0];
  const data = useMemo(() => {
    if (!selectedSheet) return { steps: [] };
    const problemIdPrefix =
      selectedSheet.id === "dsa" ? "" : `${selectedSheet.id}::`;
    return {
      steps: selectedSheet.sheet.steps.map((step) => ({
        ...step,
        id: `${selectedSheet.id}::${step.id}`,
        subsections: step.subsections.map((subsection) => ({
          ...subsection,
          id: `${selectedSheet.id}::${subsection.id}`,
          problems: subsection.problems.map((problem) => ({
            ...problem,
            id: `${problemIdPrefix}${problem.id}`,
          })),
        })),
      })),
    };
  }, [selectedSheet]);

  const userName =
    profile?.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "User";
  const userUsername = profile?.username || "";
  const userLocation = profile?.location || "";
  const userWebsite = profile?.website || "";

  const openProfileSettings = () => {
    setShowSettings(true);
  };

  const handleUploadSheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSheetError("");
    setUploadingSheet(true);
    try {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        throw new Error("Choose a .txt file to upload.");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("The TXT file must be smaller than 2 MB.");
      }
      const sheetData = parseSheet(await file.text());
      const fileBaseName = file.name.replace(/\.txt$/i, "").trim();
      const title = fileBaseName
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
        .slice(0, 80);
      if (!title)
        throw new Error("The file needs a name to use as its sheet title.");

      const { data: savedSheet, error } = await supabase
        .from("user_sheets")
        .insert({
          user_id: user.id,
          title,
          source_name: file.name,
          sheet_data: sheetData,
        })
        .select("id, title, source_name, sheet_data")
        .single();
      if (error) throw error;

      const nextSheet = {
        id: `custom-${savedSheet.id}`,
        customId: savedSheet.id,
        title: savedSheet.title,
        sourceName: savedSheet.source_name,
        sheet: savedSheet.sheet_data,
        problemCount: countSheetProblems(savedSheet.sheet_data),
      };
      setCustomSheets((current) => [...current, nextSheet]);
      setSelectedSheetId(nextSheet.id);
      localStorage.setItem("dsa-active-sheet", nextSheet.id);
      setSheetSidebarOpen(false);
    } catch (error) {
      console.error("Failed to upload sheet:", error);
      setSheetError(
        error.message || "Could not upload this sheet. Please try again.",
      );
    } finally {
      setUploadingSheet(false);
    }
  };

  const downloadSampleFormat = () => {
    const url = URL.createObjectURL(
      new Blob([sampleSheetTemplate], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-sheet.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    localStorage.setItem(
      "dsa-expanded-steps",
      JSON.stringify([...expandedSteps]),
    );
  }, [expandedSteps]);
  useEffect(() => {
    localStorage.setItem(
      "dsa-expanded-subs",
      JSON.stringify([...expandedSubs]),
    );
  }, [expandedSubs]);
  useEffect(() => {
    localStorage.setItem("dsa-hide-skipped", String(hideSkipped));
  }, [hideSkipped]);
  useEffect(() => {
    localStorage.setItem("dsa-filter", activeFilter);
  }, [activeFilter]);
  useEffect(() => {
    localStorage.setItem("dsa-search", search);
  }, [search]);
  useEffect(() => {
    if (selectedSheet)
      localStorage.setItem("dsa-active-sheet", selectedSheet.id);
  }, [selectedSheet]);
  const totalProblems = data.steps.reduce(
    (sum, s) =>
      sum + s.subsections.reduce((ss, sub) => ss + sub.problems.length, 0),
    0,
  );
  const sheetProblems = data.steps.flatMap((step) =>
    step.subsections.flatMap((subsection) => subsection.problems),
  );
  const doneCount = sheetProblems.filter(
    (problem) => progress[problem.id] === "done",
  ).length;
  const skippedCount = sheetProblems.filter(
    (problem) => progress[problem.id] === "skipped",
  ).length;
  const todoCount = totalProblems - doneCount - skippedCount;
  const profileSheetStats = useMemo(
    () =>
      availableSheets.map((sheet) => {
        const idPrefix = sheet.id === "dsa" ? "" : `${sheet.id}::`;
        const problems = sheet.sheet.steps.flatMap((step) =>
          step.subsections.flatMap((subsection) => subsection.problems),
        );
        const solved = problems.filter(
          (problem) => progress[`${idPrefix}${problem.id}`] === "done",
        ).length;
        const skipped = problems.filter(
          (problem) =>
            progress[`${idPrefix}${problem.id}`] === "skipped" ||
            (!progress[`${idPrefix}${problem.id}`] && problem.defaultSkip),
        ).length;
        return {
          id: sheet.id,
          title: sheet.title,
          solved,
          skipped,
          total: problems.length,
        };
      }),
    [availableSheets, progress],
  );
  const profileProblemsTotal = profileSheetStats.reduce(
    (total, sheet) => total + sheet.total,
    0,
  );
  const profileProblemsSolved = profileSheetStats.reduce(
    (total, sheet) => total + sheet.solved,
    0,
  );
  const recentAccepted = useMemo(
    () =>
      availableSheets
        .flatMap((sheet) => {
          const idPrefix = sheet.id === "dsa" ? "" : `${sheet.id}::`;
          return sheet.sheet.steps.flatMap((step) =>
            step.subsections.flatMap((subsection) =>
              subsection.problems.flatMap((problem) => {
                const id = `${idPrefix}${problem.id}`;
                const acceptedOn = completedOn[id];
                if (progress[id] !== "done") return [];
                return [
                  {
                    id,
                    title: problem.title,
                    sheetTitle: sheet.title,
                    acceptedOn: acceptedOn || null,
                    completedAt: completedAt[id] || null,
                  },
                ];
              }),
            ),
          );
        })
        .sort((first, second) => {
          if (first.completedAt && second.completedAt) {
            return second.completedAt.localeCompare(first.completedAt);
          }
          if (first.completedAt) return -1;
          if (second.completedAt) return 1;
          if (!first.acceptedOn && !second.acceptedOn) return 0;
          if (!first.acceptedOn) return 1;
          if (!second.acceptedOn) return -1;
          return second.acceptedOn.localeCompare(first.acceptedOn);
        })
        .slice(0, 8),
    [availableSheets, completedAt, completedOn, progress],
  );

  const dailyStreak = useMemo(() => {
    let streak = 0;
    const [year, month, day] = todayDateKey.split("-").map(Number);
    let currentDate = new Date(year, month - 1, day);
    currentDate.setHours(0, 0, 0, 0);
    if (!activityLog[getLocalDateKey(currentDate)]) {
      currentDate.setDate(currentDate.getDate() - 1);
    }
    while (true) {
      if (activityLog[getLocalDateKey(currentDate)] > 0) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [activityLog, todayDateKey]);

  const longestStreak = useMemo(() => {
    const activeDates = Object.entries(activityLog)
      .filter(([, count]) => count > 0)
      .map(([date]) => date)
      .sort();
    let longest = 0;
    let current = 0;
    let previousDate = null;

    for (const dateKey of activeDates) {
      const [year, month, day] = dateKey.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (previousDate) {
        const expected = new Date(previousDate);
        expected.setDate(expected.getDate() + 1);
        if (getLocalDateKey(expected) === dateKey) current++;
        else current = 1;
      } else {
        current = 1;
      }
      previousDate = date;
      longest = Math.max(longest, current);
    }
    return longest;
  }, [activityLog]);

  const yearlyActivityTotal = useMemo(() => {
    const [year, month, day] = todayDateKey.split("-").map(Number);
    const today = new Date(year, month - 1, day);
    today.setHours(0, 0, 0, 0);
    const firstDate = new Date(today);
    firstDate.setDate(
      firstDate.getDate() - ((firstDate.getDay() + 6) % 7) - 52 * 7,
    );
    return Object.entries(activityLog).reduce(
      (total, [date, count]) =>
        date >= getLocalDateKey(firstDate) && date <= getLocalDateKey(today)
          ? total + count
          : total,
      0,
    );
  }, [activityLog, todayDateKey]);

  const yearlyActiveDays = useMemo(() => {
    const [year, month, day] = todayDateKey.split("-").map(Number);
    const today = new Date(year, month - 1, day);
    today.setHours(0, 0, 0, 0);
    const firstDate = new Date(today);
    firstDate.setDate(
      firstDate.getDate() - ((firstDate.getDay() + 6) % 7) - 52 * 7,
    );
    return Object.entries(activityLog).filter(
      ([date, count]) =>
        count > 0 &&
        date >= getLocalDateKey(firstDate) &&
        date <= getLocalDateKey(today),
    ).length;
  }, [activityLog, todayDateKey]);

  const heatmapData = useMemo(() => {
    const weeks = [];
    const [year, month, day] = todayDateKey.split("-").map(Number);
    const today = new Date(year, month - 1, day);
    today.setHours(0, 0, 0, 0);
    const gridStart = new Date(today);
    gridStart.setDate(
      gridStart.getDate() - ((gridStart.getDay() + 6) % 7) - 52 * 7,
    );
    const firstDate = new Date(gridStart);

    for (let weekIndex = 0; weekIndex < 53; weekIndex++) {
      const week = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
        const dateKey = getLocalDateKey(date);
        const outOfRange = date < firstDate || date > today;
        const count = outOfRange ? 0 : activityLog[dateKey] || 0;
        week.push({
          date,
          dateKey,
          count,
          outOfRange,
          intensity: getActivityLevel(count),
        });
      }
      weeks.push(week);
    }
    const monthLabels = weeks.map((week) => {
      const firstOfMonth = week.find(
        (day) => !day.outOfRange && day.date.getDate() === 1,
      );
      return firstOfMonth
        ? firstOfMonth.date.toLocaleDateString(undefined, { month: "short" })
        : "";
    });
    return { weeks, monthLabels };
  }, [activityLog, todayDateKey]);

  const progressState = useCallback(
    (id) => {
      const prob = data.steps
        .flatMap((s) => s.subsections.flatMap((sub) => sub.problems))
        .find((p) => p.id === id);
      if (!prob) return "todo";
      return getState(id, prob.defaultSkip);
    },
    [data, getState],
  );

  const handleToggle = useCallback(
    (id) => {
      const current = progressState(id);
      update(id, current === "done" ? "todo" : "done");
    },
    [progressState, update],
  );

  const handleSkip = useCallback(
    (id) => {
      const current = progressState(id);
      update(id, current === "skipped" ? "todo" : "skipped");
    },
    [progressState, update],
  );

  const toggleStep = useCallback((id) => {
    setExpandedSteps((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleSub = useCallback((id) => {
    setExpandedSubs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allSteps = new Set(data.steps.map((s) => s.id));
    const allSubs = new Set(
      data.steps.flatMap((s) => s.subsections.map((sub) => sub.id)),
    );
    setExpandedSteps(allSteps);
    setExpandedSubs(allSubs);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
    setExpandedSubs(new Set());
  }, []);

  const filteredSteps = useMemo(() => {
    let result = data.steps;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result
        .map((step) => {
          const filteredSubs = step.subsections
            .map((sub) => {
              const filteredProbs = sub.problems.filter((p) =>
                p.title.toLowerCase().includes(q),
              );
              return { ...sub, problems: filteredProbs };
            })
            .filter((sub) => sub.problems.length > 0);
          return { ...step, subsections: filteredSubs };
        })
        .filter((step) => step.subsections.length > 0);
    }
    return result;
  }, [search, data]);

  const exportProgress = (sheet) => {
    const idPrefix = sheet.id === "dsa" ? "" : `${sheet.id}::`;
    const allProblems = sheet.sheet.steps.flatMap((step) =>
      step.subsections.flatMap((subsection) => subsection.problems),
    );
    const exportData = {};
    allProblems.forEach((problem) => {
      const id = `${idPrefix}${problem.id}`;
      const state = progress[id];
      if (state === "done" || state === "skipped") {
        exportData[problem.title] = { id, state };
      }
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.id}-progress.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupAction("");
  };

  const importProgress = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const fileContent = loadEvent.target.result;
        const imported = JSON.parse(fileContent);
        if (
          !imported ||
          typeof imported !== "object" ||
          Array.isArray(imported)
        ) {
          alert(
            "Invalid backup file format. Choose a progress backup JSON exported from your profile.",
          );
          return;
        }
        const targetSheetId = importSheetId.current;
        const targetSheet = availableSheets.find(
          (sheet) => sheet.id === targetSheetId,
        );
        if (!targetSheet) {
          alert("Select a valid sheet before importing progress.");
          return;
        }
        const idPrefix = targetSheet.id === "dsa" ? "" : `${targetSheet.id}::`;
        const validProblemIds = new Set(
          targetSheet.sheet.steps.flatMap((step) =>
            step.subsections.flatMap((subsection) =>
              subsection.problems.map((problem) => `${idPrefix}${problem.id}`),
            ),
          ),
        );
        const newProgress = {};
        let importedCount = 0;
        for (const [title, value] of Object.entries(imported)) {
          if (value && typeof value === "object" && value.id && value.state) {
            const sourceId = String(value.id);
            const id =
              targetSheet.id === "dsa"
                ? sourceId.replace(/^dsa::/, "")
                : sourceId.startsWith(idPrefix)
                  ? sourceId
                  : `${idPrefix}${sourceId}`;
            const state = value.state;
            if (
              validProblemIds.has(id) &&
              (state === "done" || state === "skipped")
            ) {
              newProgress[id] = state;
              importedCount++;
            }
          }
        }
        if (importedCount === 0) {
          alert(
            `No matching problem states were found for ${targetSheet.title}. Choose a progress backup that contains problem IDs from this sheet.`,
          );
          return;
        }
        const saved = await bulkUpdate(newProgress);
        if (!saved) {
          alert(
            "The backup was read, but progress could not be saved to your account. Check the sync error and try again.",
          );
          return;
        }
        alert(
          `Successfully imported ${importedCount} problem states into ${targetSheet.title}.`,
        );
      } catch (err) {
        console.error("Import error details:", err);
        alert(`Failed to import backup file: ${err.message}`);
      }
    };
    reader.onerror = () => alert("Failed to read backup file");
    reader.readAsText(file);
    e.target.value = "";
    setBackupAction("");
  };

  const chipActive = (type) =>
    activeFilter === type
      ? "bg-[#6D5BF6] text-white"
      : "bg-[#15151B] text-[#8A8A98] hover:text-white";

  if (peopleSearchPage) {
    return (
      <PeopleSearchPage
        query={profileSearchQuery}
        onQueryChange={setProfileSearchQuery}
        results={profileSearchResults}
        loading={profileSearchLoading}
        error={profileSearchError}
        onSelectProfile={openPublicProfile}
        onBack={() => navigateTo("/")}
      />
    );
  }

  if (selectedPublicUsername) {
    return (
      <PublicProfilePage
        profile={publicProfile}
        loading={publicProfileLoading}
        error={publicProfileError}
        copied={copiedProfileLink}
        onCopyLink={copyPublicProfileLink}
        onBack={returnFromPublicProfile}
      />
    );
  }

  if (progressLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans flex items-center justify-center">
        <p className="text-[#8A8A98]">Syncing your saved progress…</p>
      </div>
    );
  }

  function PeopleSearchPage({
    query,
    onQueryChange,
    results,
    loading,
    error,
    onSelectProfile,
    onBack,
  }) {
    return (
      <div className="profile-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans transition-colors duration-300">
        <header className="dashboard-header sticky top-0 z-50 border-b">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-6">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to tracker"
              className="rounded-lg p-2 text-[#E8E8EE] transition-colors hover:bg-[#1C1C24]"
            >
              <ChevronDown size={20} className="rotate-90" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6D5BF6]">
                <CheckSquare size={16} className="text-white" />
              </div>
              <span className="font-bold tracking-tight">DSA TRACKER</span>
            </div>
            <div className="flex-1" />
            <span className="text-sm font-medium text-[#A1A1AA]">Search</span>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-14">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">Find people</h1>
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#8A8A98]"
            />
            <input
              id="people-search"
              aria-label="Search by username"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onQueryChange("");
                if (event.key === "Enter" && results[0])
                  onSelectProfile(results[0].username);
              }}
              placeholder="Search by username"
              aria-autocomplete="list"
              aria-controls="people-search-results"
              className="h-12 w-full rounded-xl border border-[#34343F] bg-[#111111] pl-11 pr-4 text-sm text-[#E8E8EE] placeholder-[#8A8A98] outline-none transition-colors focus:border-[#765cf6]"
            />
            {query.trim().length >= 3 && (
              <div
                id="people-search-results"
                role="listbox"
                className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-[#34343F] bg-[#111111] shadow-2xl"
              >
                {loading ? (
                  <p className="px-4 py-3 text-sm text-[#8A8A98]">
                    Searching people…
                  </p>
                ) : error ? (
                  <p role="alert" className="px-4 py-3 text-sm text-red-300">
                    {error}
                  </p>
                ) : results.length ? (
                  results.map((result) => (
                    <button
                      key={result.username}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => onSelectProfile(result.username)}
                      className="flex w-full items-center gap-3 border-b border-[#26262F] px-4 py-3 text-left last:border-0 hover:bg-[#1C1C24]"
                    >
                      <span className="people-result-avatar">
                        {(result.name || result.username)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#E8E8EE]">
                          {result.name || result.username}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#8A8A98]">
                          @{result.username}
                        </span>
                      </span>
                      <ChevronRight
                        size={17}
                        className="text-[#8A8A98]"
                        aria-hidden="true"
                      />
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-[#8A8A98]">
                    No users found. Try a different username.
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-[#8A8A98]">3 characters minimum.</p>
        </main>
      </div>
    );
  }

  function PublicProfilePage({
    profile,
    loading,
    error,
    copied,
    onCopyLink,
    onBack,
  }) {
    const [dateKey, setDateKey] = useState(() => getLocalDateKey(new Date()));
    useEffect(() => {
      const timer = window.setInterval(() => {
        setDateKey((current) => {
          const today = getLocalDateKey(new Date());
          return current === today ? current : today;
        });
      }, 60_000);
      return () => window.clearInterval(timer);
    }, []);

    const activity = profile?.activity || {};
    const heatmapData = useMemo(() => {
      const [year, month, day] = dateKey.split("-").map(Number);
      const today = new Date(year, month - 1, day);
      today.setHours(0, 0, 0, 0);
      const start = new Date(today);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 52 * 7);
      const weeks = [];
      for (let weekIndex = 0; weekIndex < 53; weekIndex++) {
        const week = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const date = new Date(start);
          date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
          const dateKey = getLocalDateKey(date);
          const outOfRange = date > today;
          const count = outOfRange ? 0 : Number(activity[dateKey] || 0);
          week.push({
            date,
            dateKey,
            count,
            outOfRange,
            intensity: getActivityLevel(count),
          });
        }
        weeks.push(week);
      }
      const monthLabels = weeks.map((week) => {
        const firstOfMonth = week.find(
          (item) => !item.outOfRange && item.date.getDate() === 1,
        );
        return firstOfMonth
          ? firstOfMonth.date.toLocaleDateString(undefined, { month: "short" })
          : "";
      });
      return { weeks, monthLabels };
    }, [activity, dateKey]);

    const profileProgress = profile?.progress || [];
    const progressById = useMemo(
      () => new Map(profileProgress.map((row) => [row.problem_id, row])),
      [profileProgress],
    );
    const customSheets = profile?.custom_sheets || [];
    const profileSheetStats = useMemo(() => {
      const builtInStats = builtInSheets.map((sheet) => {
        const idPrefix = sheet.id === "dsa" ? "" : `${sheet.id}::`;
        const problems = sheet.sheet.steps.flatMap((step) =>
          step.subsections.flatMap((subsection) => subsection.problems),
        );
        const solved = problems.filter(
          (problem) =>
            progressById.get(`${idPrefix}${problem.id}`)?.state === "done",
        ).length;
        const skipped = problems.filter((problem) => {
          const row = progressById.get(`${idPrefix}${problem.id}`);
          return row?.state === "skipped" || (!row && problem.defaultSkip);
        }).length;
        return {
          id: sheet.id,
          title: sheet.title,
          solved,
          skipped,
          total: problems.length,
        };
      });
      const uploadedStats = customSheets.map((sheet, index) => ({
        id: `${sheet.title}-${index}`,
        title: sheet.title,
        solved: Number(sheet.solved || 0),
        skipped: Number(sheet.skipped || 0),
        total: Number(sheet.total || 0),
      }));
      return [...builtInStats, ...uploadedStats];
    }, [customSheets, progressById]);
    const recentAccepted = useMemo(() => {
      const builtInAccepted = builtInSheets.flatMap((sheet) => {
        const idPrefix = sheet.id === "dsa" ? "" : `${sheet.id}::`;
        return sheet.sheet.steps.flatMap((step) =>
          step.subsections.flatMap((subsection) =>
            subsection.problems.flatMap((problem) => {
              const id = `${idPrefix}${problem.id}`;
              const row = progressById.get(id);
              if (row?.state !== "done") return [];
              return [
                {
                  id,
                  title: problem.title,
                  sheetTitle: sheet.title,
                  acceptedOn: row.completed_on || null,
                  completedAt: row.updated_at || null,
                },
              ];
            }),
          ),
        );
      });
      const uploadedAccepted = (profile?.custom_recent_accepted || []).map(
        (problem, index) => ({
          id: `custom-${index}:${problem.sheet_title}:${problem.title}`,
          title: problem.title,
          sheetTitle: problem.sheet_title,
          acceptedOn: problem.accepted_on,
          completedAt: problem.completed_at,
        }),
      );
      return [...builtInAccepted, ...uploadedAccepted]
        .sort((first, second) => {
          if (first.completedAt && second.completedAt) {
            return second.completedAt.localeCompare(first.completedAt);
          }
          if (first.completedAt) return -1;
          if (second.completedAt) return 1;
          if (!first.acceptedOn && !second.acceptedOn) return 0;
          if (!first.acceptedOn) return 1;
          if (!second.acceptedOn) return -1;
          return second.acceptedOn.localeCompare(first.acceptedOn);
        })
        .slice(0, 8);
    }, [profile?.custom_recent_accepted, progressById]);
    const activeDays = heatmapData.weeks
      .flat()
      .filter((item) => !item.outOfRange && item.count > 0).length;
    const profileProblemsSolved = profileSheetStats.reduce(
      (total, sheet) => total + sheet.solved,
      0,
    );
    const profileProblemsTotal = profileSheetStats.reduce(
      (total, sheet) => total + sheet.total,
      0,
    );
    const solvedPastYear = heatmapData.weeks
      .flat()
      .filter((item) => !item.outOfRange)
      .reduce((total, item) => total + item.count, 0);

    return (
      <div className="profile-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans">
        <header className="dashboard-header sticky top-0 z-50 border-b">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 md:px-6">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to tracker"
              className="rounded-lg p-2 text-[#E8E8EE] transition-colors hover:bg-[#1C1C24]"
            >
              <ChevronDown size={20} className="rotate-90" />
            </button>
            <h1 className="text-xl font-bold">Public profile</h1>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-lg border border-[#34343F] px-3 py-2 text-sm font-medium text-[#E8E8EE] transition-colors hover:bg-[#1C1C24]"
            >
              {copied ? "Link copied" : "Share profile"}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6">
          {error && !loading && !profile ? (
            <section className="surface-card rounded-2xl border p-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-violet-300">
                {error === "This profile could not be found."
                  ? "404"
                  : "Profile"}
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {error === "This profile could not be found."
                  ? "Profile not found"
                  : "Could not load profile"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#8A8A98]">
                {error === "This profile could not be found."
                  ? "This username doesn’t match a public profile. Check the spelling or search for another user."
                  : error}
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-6 rounded-lg bg-[#6D5BF6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B4AD6]"
              >
                Find people
              </button>
            </section>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300"
            >
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="surface-card rounded-2xl border p-6 text-sm text-[#8A8A98]">
              Loading profile…
            </div>
          ) : (
            profile && (
              <div className="profile-layout">
                <aside className="profile-sidebar">
                <section className="profile-hero">
                  <div className="profile-avatar">
                    {(profile.name || profile.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold text-[#E8E8EE]">
                      {profile.name || profile.username}
                    </h2>
                    <p className="mt-1 text-sm text-[#8A8A98]">
                      @{profile.username}
                    </p>
                    {profile.location && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-[#8A8A98]">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {profile.location}
                      </div>
                    )}
                    {profile.website && (
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block break-all text-sm text-[#A1A1AA] hover:text-white hover:underline"
                      >
                        {profile.website}
                      </a>
                    )}
                    <a
                      href={`/user/${encodeURIComponent(profile.username)}`}
                      className="mt-4 block break-all text-xs text-[#8A8A98] hover:text-violet-300"
                    >
                      {window.location.host}/user/{profile.username}
                    </a>
                  </div>
                </section>
                </aside>

                <div className="profile-main">
                <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
                  <div className="surface-card stat-card rounded-xl border border-[#26262F] bg-[#15151B] p-4">
                    <div className="mb-1 flex items-center gap-2 text-[#8A8A98]">
                      <Calendar size={16} />
                      <span className="text-xs font-medium">Current streak</span>
                    </div>
                    <div className="text-2xl font-bold text-[#FF6B35]">
                      {Number(profile.current_streak || 0)}
                    </div>
                    <div className="mt-1 text-xs text-[#8A8A98]">current days</div>
                  </div>
                  <div className="surface-card stat-card rounded-xl border border-[#26262F] bg-[#15151B] p-4">
                    <div className="mb-1 flex items-center gap-2 text-[#8A8A98]">
                      <Trophy size={16} />
                      <span className="text-xs font-medium">Best streak</span>
                    </div>
                    <div className="text-2xl font-bold text-[#6D5BF6]">
                      {Number(profile.longest_streak || 0)}
                    </div>
                    <div className="mt-1 text-xs text-[#8A8A98]">longest streak</div>
                  </div>
                  <div className="surface-card stat-card col-span-2 rounded-xl border border-[#26262F] bg-[#15151B] p-4 md:col-span-1">
                    <div className="mb-1 flex items-center gap-2 text-[#8A8A98]">
                      <Target size={16} />
                      <span className="text-xs font-medium">Problems</span>
                    </div>
                    <div className="text-2xl font-bold text-[#22A559]">
                      {profileProblemsSolved}
                    </div>
                    <div className="mt-1 text-xs text-[#8A8A98]">
                      of {profileProblemsTotal} across all sheets
                    </div>
                  </div>
                </div>

                <section
                  className="surface-card mb-8 rounded-2xl border border-[#26262F] bg-[#15151B] p-6"
                  aria-labelledby="public-profile-sheet-progress"
                >
                  <h2
                    id="public-profile-sheet-progress"
                    className="mb-4 text-lg font-semibold text-[#E8E8EE]"
                  >
                    Sheet progress
                  </h2>
                  <div className="space-y-4">
                    {profileSheetStats.map((sheet) => {
                      const percentage = sheet.total
                        ? Math.round((sheet.solved / sheet.total) * 100)
                        : 0;
                      return (
                        <div key={sheet.id}>
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="truncate font-medium text-[#E8E8EE]">
                              {sheet.title}
                            </span>
                            <span className="shrink-0 tabular-nums text-[#8A8A98]">
                              <span className="text-[#22A559]">{sheet.solved} solved</span>
                              <span className="mx-2 text-[#52525B]">·</span>
                              <span className="text-[#E65100]">{sheet.skipped} skipped</span>
                              <span className="mx-2 text-[#52525B]">·</span>
                              {sheet.total} total
                            </span>
                          </div>
                          <div
                            className="h-2 overflow-hidden rounded-full bg-[#26262F]"
                            role="progressbar"
                            aria-label={`${sheet.title} progress`}
                            aria-valuemin={0}
                            aria-valuemax={sheet.total}
                            aria-valuenow={sheet.solved}
                          >
                            <div
                              className="h-full rounded-full bg-[#6D5BF6] transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="surface-card mb-6 rounded-2xl border border-[#26262F] bg-[#15151B] p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[#E8E8EE]">
                      {solvedPastYear.toLocaleString()} problems solved in the past year
                    </h2>
                    <div
                      className="flex items-center gap-2 text-xs text-[#8A8A98]"
                      aria-label="Activity scale: less to more"
                    >
                      <span>Less</span>
                      <div className="flex gap-1">
                        {["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"].map(
                          (color) => (
                            <span
                              key={color}
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: color }}
                            />
                          ),
                        )}
                      </div>
                      <span>More</span>
                    </div>
                  </div>
                  <div className="activity-scroll pb-2">
                    <div className="activity-months mb-2 text-[10px] text-[#8A8A98]">
                      {heatmapData.monthLabels.map((month, index) => (
                        <span key={index} className="whitespace-nowrap">
                          {month}
                        </span>
                      ))}
                    </div>
                    <div className="activity-heatmap">
                      <div className="activity-weekday-labels text-[9px] leading-[11px] text-[#8A8A98]">
                        {["Mon", "", "Wed", "", "Fri", "", ""].map(
                          (label, index) => (
                            <span key={`weekday-${index}`}>{label}</span>
                          ),
                        )}
                      </div>
                      <div className="activity-weeks">
                        {heatmapData.weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="activity-week">
                            {week.map((item) => (
                              <span
                                key={item.dateKey}
                                aria-label={`${item.count} problems solved on ${item.date.toLocaleDateString()}`}
                                title={`${item.count} ${item.count === 1 ? "problem" : "problems"} solved on ${item.date.toLocaleDateString()}`}
                                className="activity-day block rounded-[2px] border border-white/[0.04]"
                                style={{
                                  backgroundColor: [
                                    "#161b22",
                                    "#0e4429",
                                    "#006d32",
                                    "#26a641",
                                    "#39d353",
                                  ][item.intensity],
                                  visibility: item.outOfRange
                                    ? "hidden"
                                    : "visible",
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[#8A8A98]">
                    <span>Total active days: {activeDays}</span>
                    <span>Refreshes automatically while this profile is open</span>
                  </div>
                </section>

                <section
                  className="recent-ac-card surface-card"
                  aria-labelledby="public-recent-ac-heading"
                >
                  <div className="recent-ac-heading">
                    <div>
                      <h2 id="public-recent-ac-heading">Recent AC</h2>
                      <p>Latest accepted problems</p>
                    </div>
                    <span className="recent-ac-count">{recentAccepted.length}</span>
                  </div>
                  {recentAccepted.length > 0 ? (
                    <ul className="recent-ac-list">
                      {recentAccepted.map((problem) => (
                        <li key={problem.id} className="recent-ac-item">
                          <div className="recent-ac-check" aria-hidden="true">✓</div>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium text-[#E8E8EE]"
                              title={problem.title}
                            >
                              {problem.title}
                            </p>
                            <p className="mt-1 truncate text-xs text-[#858585]">
                              {problem.sheetTitle}
                            </p>
                          </div>
                          {problem.acceptedOn ? (
                            <time className="recent-ac-date" dateTime={problem.acceptedOn}>
                              {new Date(`${problem.acceptedOn}T00:00:00`).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </time>
                          ) : (
                            <span className="recent-ac-date">Date unavailable</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="recent-ac-empty">
                      Accepted problems will show here as they are solved.
                    </p>
                  )}
                </section>
                </div>
              </div>
            )
          )}
        </main>
      </div>
    );
  }

  // Profile page component
  function ProfilePage() {
    return (
      <div className="profile-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans transition-colors duration-300">
        <header className="dashboard-header sticky top-0 z-50 bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
          <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-4 flex items-center gap-4">
            <button
              onClick={() => setShowProfile(false)}
              className="p-2 rounded-lg hover:bg-[#1C1C24] transition-colors text-[#E8E8EE]"
            >
              <ChevronDown size={20} className="rotate-90" />
            </button>
            <h1 className="font-bold text-xl">My Profile</h1>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              {userUsername && (
                <button
                  type="button"
                  onClick={() => {
                    publicProfileReturnPath.current = "/";
                    navigateTo(`/u/${encodeURIComponent(userUsername)}`);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-[#34343F] px-3 py-2 text-sm font-medium text-[#E8E8EE] transition-colors hover:bg-[#1C1C24]"
                >
                  <Link2 size={16} />
                  <span className="hidden sm:inline">Public profile</span>
                </button>
              )}
              <button
                onClick={openProfileSettings}
                aria-label="Edit profile settings"
                className="p-2 rounded-lg hover:bg-[#1C1C24] transition-colors text-[#8A8A98]"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-red-900/20 transition-colors text-red-400"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1440px] mx-auto px-4 md:px-6 py-8">
          {(authError || progressError) && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300"
            >
              {authError || progressError}
            </div>
          )}
          <div className="profile-layout">
            <aside className="profile-sidebar">
              <section className="profile-hero">
                <div className="profile-avatar">
                  {userName.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="profile-user-details">
                  <h1 className="text-2xl font-bold text-[#E8E8EE]">
                    {userName}
                  </h1>
                  {user.email && (
                    <p className="mt-1 break-all text-sm text-[#8A8A98]">
                      {user.email}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-[#8A8A98]">@{userUsername}</p>
                  {userLocation && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[#8A8A98]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {userLocation}
                    </div>
                  )}
                  {userWebsite && (
                    <a
                      href={userWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block break-all text-sm text-[#A1A1AA] hover:text-white hover:underline"
                    >
                      {userWebsite}
                    </a>
                  )}
                </div>
              </section>

              <section className="surface-card rounded-2xl border border-[#26262F] bg-[#15151B] divide-y divide-[#26262F]">
                <div className="p-4">
                  <h2 className="mb-4 text-lg font-semibold text-[#E8E8EE]">
                    Progress &amp; Data Management
                  </h2>
                  <div className="space-y-3">
                    <button
                      onClick={() => setBackupAction("export")}
                      className="w-full flex items-center justify-between p-3.5 rounded-lg hover:bg-[#1C1C24] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#6D5BF6]/20 flex items-center justify-center text-[#6D5BF6]">
                          <Download size={20} />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-[#E8E8EE]">
                            Export Progress
                          </div>
                          <div className="text-xs text-[#8A8A98]">
                            Download your progress as JSON
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className="rotate-90 text-[#8A8A98]"
                      />
                    </button>

                    <button
                      onClick={() => setBackupAction("import")}
                      className="w-full flex items-center justify-between p-3.5 rounded-lg hover:bg-[#1C1C24] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#E65100]/20 flex items-center justify-center text-[#E65100]">
                          <Upload size={20} />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-[#E8E8EE]">
                            Import Progress
                          </div>
                          <div className="text-xs text-[#8A8A98]">
                            Restore progress from backup
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className="rotate-90 text-[#8A8A98]"
                      />
                    </button>

                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Reset all progress across every sheet? This cannot be undone.",
                          )
                        )
                          reset();
                      }}
                      className="w-full flex items-center justify-between rounded-lg p-3.5 transition-colors hover:bg-red-900/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                          <RefreshCcw size={20} />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-red-300">
                            Reset All Sheets
                          </div>
                          <div className="text-xs text-[#8A8A98]">
                            Clear all progress and activity
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className="rotate-90 text-[#8A8A98]"
                      />
                    </button>

                    <input
                      ref={importFileInput}
                      id="import-file"
                      type="file"
                      accept=".json,application/json"
                      aria-label="Choose a progress backup JSON file"
                      className="fixed left-0 top-0 h-px w-px opacity-0"
                      onChange={importProgress}
                    />
                  </div>
                </div>
              </section>
            </aside>

            <div className="profile-main">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-8 md:grid-cols-3">
                <div className="surface-card stat-card bg-[#15151B] rounded-xl border border-[#26262F] p-4">
                  <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
                    <Calendar size={16} />
                    <span className="text-xs font-medium">Current streak</span>
                  </div>
                  <div className="text-2xl font-bold text-[#FF6B35]">
                    {dailyStreak}
                  </div>
                  <div className="text-xs text-[#8A8A98] mt-1">
                    current days
                  </div>
                </div>
                <div className="surface-card stat-card bg-[#15151B] rounded-xl border border-[#26262F] p-4">
                  <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
                    <Trophy size={16} />
                    <span className="text-xs font-medium">Best streak</span>
                  </div>
                  <div className="text-2xl font-bold text-[#6D5BF6]">
                    {longestStreak}
                  </div>
                  <div className="text-xs text-[#8A8A98] mt-1">
                    longest streak
                  </div>
                </div>
                <div className="surface-card stat-card bg-[#15151B] rounded-xl border border-[#26262F] p-4">
                  <div className="flex items-center gap-2 text-[#8A8A98] mb-1">
                    <Target size={16} />
                    <span className="text-xs font-medium">Problems</span>
                  </div>
                  <div className="text-2xl font-bold text-[#22A559]">
                    {profileProblemsSolved}
                  </div>
                  <div className="text-xs text-[#8A8A98] mt-1">
                    of {profileProblemsTotal} across all sheets
                  </div>
                </div>
              </div>

              <section
                className="surface-card mb-8 rounded-2xl border border-[#26262F] bg-[#15151B] p-6"
                aria-labelledby="profile-sheet-progress"
              >
                <h2
                  id="profile-sheet-progress"
                  className="mb-4 text-lg font-semibold text-[#E8E8EE]"
                >
                  Sheet progress
                </h2>
                <div className="space-y-4">
                  {profileSheetStats.map((sheet) => {
                    const percentage = sheet.total
                      ? Math.round((sheet.solved / sheet.total) * 100)
                      : 0;
                    return (
                      <div key={sheet.id}>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-[#E8E8EE]">
                            {sheet.title}
                          </span>
                          <span className="shrink-0 tabular-nums text-[#8A8A98]">
                            <span className="text-[#22A559]">
                              {sheet.solved} solved
                            </span>
                            <span className="mx-2 text-[#52525B]">·</span>
                            <span className="text-[#E65100]">
                              {sheet.skipped} skipped
                            </span>
                            <span className="mx-2 text-[#52525B]">·</span>
                            {sheet.total} total
                          </span>
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full bg-[#26262F]"
                          role="progressbar"
                          aria-label={`${sheet.title} progress`}
                          aria-valuemin={0}
                          aria-valuemax={sheet.total}
                          aria-valuenow={sheet.solved}
                        >
                          <div
                            className="h-full rounded-full bg-[#6D5BF6] transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Activity Section */}
              <div className="surface-card bg-[#15151B] rounded-2xl border border-[#26262F] p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-[#E8E8EE]">
                    {yearlyActivityTotal.toLocaleString()} problems solved in
                    the past year
                  </h3>
                  <div
                    className="flex items-center gap-2 text-xs text-[#8A8A98]"
                    aria-label="Activity scale: less to more"
                  >
                    <span>Less</span>
                    <div className="flex gap-1">
                      {[
                        "#161b22",
                        "#0e4429",
                        "#006d32",
                        "#26a641",
                        "#39d353",
                      ].map((color) => (
                        <span
                          key={color}
                          className="w-3 h-3 rounded-sm border border-white/5"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <span>More</span>
                  </div>
                </div>
                <div className="activity-scroll pb-2">
                  <div>
                    <div className="activity-months mb-2 text-[10px] text-[#8A8A98]">
                      {heatmapData.monthLabels.map((month, index) => (
                        <span key={index} className="whitespace-nowrap">
                          {month}
                        </span>
                      ))}
                    </div>
                    <div className="activity-heatmap">
                      <div className="activity-weekday-labels text-[9px] leading-[11px] text-[#8A8A98]">
                        {["Mon", "", "Wed", "", "Fri", "", ""].map(
                          (label, index) => (
                            <span key={`weekday-${index}`}>{label}</span>
                          ),
                        )}
                      </div>
                      <div className="activity-weeks">
                        {heatmapData.weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="activity-week">
                            {week.map((day) => (
                              <span
                                key={day.dateKey}
                                aria-hidden={day.outOfRange || undefined}
                                aria-label={`${day.count} problems solved on ${day.date.toLocaleDateString()}`}
                                title={`${day.count} ${day.count === 1 ? "problem" : "problems"} solved on ${day.date.toLocaleDateString()}`}
                                className="activity-day block rounded-[2px] border border-white/[0.04] hover:ring-1 hover:ring-white/40"
                                style={{
                                  backgroundColor: [
                                    "#161b22",
                                    "#0e4429",
                                    "#006d32",
                                    "#26a641",
                                    "#39d353",
                                  ][day.intensity],
                                  visibility: day.outOfRange ? "hidden" : "visible",
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[#8A8A98]">
                      <span>Total active days: {yearlyActiveDays}</span>
                      <span>Updated live as you mark problems solved</span>
                    </div>
                  </div>
                </div>
              </div>

              <section
                className="recent-ac-card surface-card"
                aria-labelledby="recent-ac-heading"
              >
                <div className="recent-ac-heading">
                  <div>
                    <h2 id="recent-ac-heading">Recent AC</h2>
                    <p>Your latest accepted problems</p>
                  </div>
                  <span className="recent-ac-count">
                    {recentAccepted.length}
                  </span>
                </div>
                {recentAccepted.length > 0 ? (
                  <ul className="recent-ac-list">
                    {recentAccepted.map((problem) => (
                      <li key={problem.id} className="recent-ac-item">
                        <div className="recent-ac-check" aria-hidden="true">
                          ✓
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-medium text-[#E8E8EE]"
                            title={problem.title}
                          >
                            {problem.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-[#858585]">
                            {problem.sheetTitle}
                          </p>
                        </div>
                        {problem.acceptedOn ? (
                          <time
                            className="recent-ac-date"
                            dateTime={problem.acceptedOn}
                          >
                            {new Date(
                              `${problem.acceptedOn}T00:00:00`,
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </time>
                        ) : (
                          <span className="recent-ac-date">
                            Date unavailable
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="recent-ac-empty">
                    Accepted problems will show here as you solve them.
                  </p>
                )}
              </section>
            </div>
          </div>
          {backupAction && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setBackupAction("");
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="backup-sheet-title"
                className="w-full max-w-md rounded-2xl border border-[#26262F] bg-[#15151B] p-5 shadow-2xl"
              >
                <h2
                  id="backup-sheet-title"
                  className="text-lg font-semibold text-[#E8E8EE]"
                >
                  {backupAction === "export"
                    ? "Choose a sheet to export"
                    : "Choose a sheet to import into"}
                </h2>
                <p className="mb-4 mt-1 text-sm text-[#8A8A98]">
                  {backupAction === "export"
                    ? "Download progress for one sheet."
                    : "Choose the sheet you want to restore, then select its progress backup file. This dialog stays open if you cancel the file picker."}
                </p>
                {backupAction === "import" && (
                  <div className="mb-4 rounded-lg border border-[#6D5BF6]/25 bg-[#6D5BF6]/10 p-3 text-sm text-[#C4BDFE]">
                    <p className="font-medium">How to import</p>
                    <ol className="mt-1 list-inside list-decimal space-y-1 text-xs leading-relaxed text-[#AFA8E8]">
                      <li>Select the destination sheet below.</li>
                      <li>Choose the matching progress backup JSON file.</li>
                      <li>
                        Only problem IDs belonging to that sheet will be
                        imported.
                      </li>
                    </ol>
                    <p className="mt-2 text-xs text-[#AFA8E8]">
                      Create a backup with Profile → Export Progress if you
                      don’t have one yet.
                    </p>
                  </div>
                )}
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {availableSheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => {
                        if (backupAction === "export") {
                          exportProgress(sheet);
                          return;
                        }
                        importSheetId.current = sheet.id;
                        const input = importFileInput.current;
                        if (!input) {
                          alert(
                            "Could not open the file picker. Please try Import again.",
                          );
                          return;
                        }
                        input.click();
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-[#E8E8EE] transition-colors hover:bg-[#26262F]"
                    >
                      <span>{sheet.title}</span>
                      <span className="text-xs text-[#8A8A98]">
                        {sheet.problemCount} problems
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setBackupAction("")}
                  className="mt-4 w-full rounded-lg border border-[#34343F] px-4 py-2 text-sm text-[#A1A1AA] hover:bg-[#1C1C24] hover:text-white"
                >
                  Cancel
                </button>
              </section>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (showSettings) {
    return (
      <ProfileSettings
        userId={user.id}
        profile={profile}
        onBack={() => setShowSettings(false)}
        onSaved={onProfileUpdated}
      />
    );
  }

  if (showProfile) {
    return <ProfilePage />;
  }

  return (
    <div
      className={`dashboard-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans transition-colors duration-300`}
      data-theme={theme === "light" ? "light" : undefined}
    >
      <header className="dashboard-header sticky top-0 z-50 bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => setSheetSidebarOpen((open) => !open)}
            className="p-1.5 -ml-1 text-[#E8E8EE]"
            aria-label={
              sheetSidebarOpen ? "Hide sheets sidebar" : "Show sheets sidebar"
            }
            aria-expanded={sheetSidebarOpen}
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6D5BF6] to-[#8B7CFD] flex items-center justify-center shadow-md shadow-[#6D5BF6]/20 flex-shrink-0">
              <CheckSquare size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight truncate">
              {selectedSheet?.title || "DSA Sheet"}
            </h1>
          </div>
          <div className="flex-1" />
          <div className="relative hidden sm:block">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems..."
              className="pl-8 pr-8 py-1.5 w-48 lg:w-72 bg-[#15151B] border border-[#26262F] rounded-lg text-sm text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:border-[#6D5BF6] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openPeopleSearch}
            aria-label="Find people"
            aria-current={peopleSearchPage ? "page" : undefined}
            className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#1C1C24] hover:text-[#E8E8EE] sm:px-3"
          >
            <Users size={17} />
            <span className="hidden sm:inline">People</span>
          </button>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="p-1.5 rounded-lg hover:bg-[#1C1C24] text-[#8A8A98] hover:text-[#E8E8EE] transition-colors"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => setShowProfile(true)}
            aria-label="Profile"
            className="profile-trigger w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          >
            <User size={14} className="text-[#6D5BF6]" />
          </button>
        </div>
      </header>

      <main className="dashboard-main max-w-7xl mx-auto px-4 md:px-6 py-6 flex min-h-0">
        {progressError && (
          <div
            role="alert"
            className="fixed bottom-4 right-4 z-[60] max-w-md rounded-lg border border-red-500/30 bg-[#15151B] p-4 text-sm text-red-300 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <p>{progressError}</p>
              <button
                onClick={() => setProgressError("")}
                aria-label="Dismiss sync error"
                className="text-red-200 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {authError && (
          <div
            role="alert"
            className="fixed bottom-4 right-4 z-[60] max-w-md rounded-lg border border-red-500/30 bg-[#15151B] p-4 text-sm text-red-300 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <p>{authError}</p>
            </div>
          </div>
        )}
        {sheetSidebarOpen && (
          <aside className="surface-card fixed top-[57px] bottom-0 left-0 z-40 w-64 overflow-y-auto border-r border-[#26262F] bg-[#0B0B0F] p-3 shadow-2xl lg:static lg:top-auto lg:bottom-auto lg:z-auto lg:w-56 lg:flex-shrink-0 lg:rounded-2xl lg:border lg:shadow-none">
            <div className="mb-3 flex items-center justify-between px-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8A8A98]">
                Your sheets
              </h2>
              <button
                onClick={() => setSheetSidebarOpen(false)}
                className="rounded p-1 text-[#8A8A98] hover:bg-[#1C1C24] hover:text-white lg:hidden"
                aria-label="Close sheets sidebar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mb-3 px-1">
              <button
                type="button"
                onClick={() => uploadSheetInput.current?.click()}
                disabled={uploadingSheet}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#34343F] px-3 py-2 text-sm text-[#E8E8EE] transition-colors hover:border-[#6D5BF6]/60 hover:bg-[#1C1C24] disabled:cursor-wait disabled:opacity-60"
              >
                <Upload size={15} />
                {uploadingSheet
                  ? "Converting and saving…"
                  : "Upload a TXT sheet"}
              </button>
              <button
                type="button"
                onClick={downloadSampleFormat}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs text-[#A1A1AA] transition-colors hover:bg-[#1C1C24] hover:text-white"
              >
                <Download size={13} />
                Download sample .txt
              </button>
              <input
                ref={uploadSheetInput}
                type="file"
                accept=".txt,text/plain"
                aria-label="Upload a problem sheet TXT file"
                className="hidden"
                onChange={handleUploadSheet}
              />
              {sheetError && (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-red-500/30 bg-red-900/20 p-2 text-xs leading-relaxed text-red-300"
                >
                  {sheetError}
                </p>
              )}
            </div>
            <nav className="space-y-1" aria-label="Problem sheets">
              {availableSheets.map((sheet) => (
                <button
                  key={sheet.id}
                  onClick={() => {
                    setSelectedSheetId(sheet.id);
                    setSheetSidebarOpen(false);
                  }}
                  aria-current={
                    selectedSheet?.id === sheet.id ? "page" : undefined
                  }
                  className={`sheet-nav-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedSheet?.id === sheet.id
                      ? "bg-[#6D5BF6]/20 text-white"
                      : "text-[#A1A1AA] hover:bg-[#1C1C24] hover:text-white"
                  }`}
                >
                  <BookOpen size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{sheet.title}</span>
                  <span className="text-xs text-[#8A8A98]">
                    {sheet.problemCount}
                  </span>
                </button>
              ))}
              {availableSheets.length === 0 && (
                <p className="px-3 py-2 text-sm text-[#8A8A98]">
                  No converted sheets found.
                </p>
              )}
              {customSheetsLoading && (
                <p className="px-3 py-2 text-xs text-[#8A8A98]">
                  Loading your uploaded sheets…
                </p>
              )}
            </nav>
          </aside>
        )}

        <section
          className="dashboard-content flex-1 min-w-0 overflow-y-auto pr-2"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          <div className="tracker-toolbar flex items-center gap-2 mb-4 flex-wrap">
            {["all", "done", "skipped", "todo"].map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                aria-pressed={activeFilter === type}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${chipActive(type)}`}
              >
                {type === "all"
                  ? "All"
                  : type === "done"
                    ? "Done"
                    : type === "skipped"
                      ? "Skipped"
                      : "To do"}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-[#8A8A98] ml-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideSkipped}
                onChange={(e) => setHideSkipped(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#26262F] bg-[#15151B] accent-[#6D5BF6]"
              />
              Hide skipped
            </label>
          </div>

          <div className="flex items-center gap-2 mb-4 text-xs text-[#8A8A98]">
            <button
              onClick={expandAll}
              className="hover:text-white transition-colors"
            >
              Expand all
            </button>
            <span>·</span>
            <button
              onClick={collapseAll}
              className="hover:text-white transition-colors"
            >
              Collapse all
            </button>
          </div>

          <div>
            {filteredSteps.map((step) => (
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

        <aside className={`hidden lg:block w-72 flex-shrink-0 space-y-3`}>
          <div className="surface-card bg-[#15151B] rounded-2xl border border-[#26262F] p-6 relative">
            <div className="mb-4">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Overall Progress
              </h3>
            </div>
            <div className="mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white tabular-nums">
                  {totalProblems > 0
                    ? Math.round((doneCount / totalProblems) * 100)
                    : 0}
                  %
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {doneCount} / {totalProblems} problems solved
              </p>
            </div>
            <div className="relative mt-4">
              <div className="h-2 bg-zinc-800 rounded-full overflow-visible relative">
                <div
                  className="h-full bg-[#6D5BF6] rounded-full transition-all duration-500 ease-out relative"
                  style={{
                    width: `${totalProblems > 0 ? (doneCount / totalProblems) * 100 : 0}%`,
                  }}
                >
                  {doneCount > 0 && (
                    <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-300 rounded-full flex items-center justify-center shadow-lg">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-zinc-700"
                      >
                        <path d="M12 15l-3 5 3-1 3 1-3-5z" />
                        <circle cx="12" cy="8" r="6" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-zinc-800/50">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-white tabular-nums">
                    {doneCount}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    Done
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[#E65100] tabular-nums">
                    {skippedCount}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    Skipped
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white tabular-nums">
                    {todoCount}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    To Do
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    confirm(
                      `Reset progress for ${selectedSheet?.title || "this sheet"} only? Other sheets will not be affected.`,
                    )
                  ) {
                    reset(sheetProblems.map((problem) => problem.id));
                  }
                }}
                className="w-full text-xs py-1.5 bg-[#1C1C24] hover:bg-red-900/30 text-[#8A8A98] hover:text-red-400 rounded-md transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCcw size={12} /> Reset This Sheet
              </button>
            </div>
          </div>
        </aside>
      </main>

      <input
        id="import-file"
        type="file"
        accept=".json"
        className="hidden"
        onChange={importProgress}
      />
    </div>
  );
}

// =============================================================================
// Step and Problem Row Components
// =============================================================================
function ProgressBar({ done, total, colorClass = "bg-[#6D5BF6]" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="w-full h-[3px] bg-[#26262F] rounded-full overflow-hidden flex-shrink-0"
      aria-label={`${pct}% complete`}
    >
      <div
        className={`${colorClass} h-full rounded-full transition-all duration-300 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ProblemRow({ prob, state, onToggle, onSkip }) {
  const isDone = state === "done";
  const isSkip = state === "skipped";

  return (
    <div
      className={`group flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors duration-200 ${isSkip ? "opacity-50 bg-[#15151B]/40" : "hover:bg-[#1C1C24]"}`}
    >
      <button
        onClick={() => onToggle(prob.id)}
        aria-label={
          isDone
            ? `Mark ${prob.title} as not done`
            : `Mark ${prob.title} as done`
        }
        className={`w-[22px] h-[22px] flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${isDone ? "bg-[#22A559] border-[#22A559]" : "border-[#6D5BF6]/60 bg-transparent hover:border-[#6D5BF6]"}`}
      >
        {isDone && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="text-white"
          >
            <path
              d="M2 7l3.5 3.5L12 4.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <button
        onClick={() => onToggle(prob.id)}
        className={`flex-1 text-left text-[15px] leading-snug transition-all duration-200 ${isDone ? "line-through text-[#8A8A98]" : "text-[#E8E8EE] hover:text-white"}`}
      >
        {prob.title}
      </button>

      <button
        onClick={() => onSkip(prob.id)}
        aria-label={isSkip ? `Unskip ${prob.title}` : `Skip ${prob.title}`}
        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md transition-colors duration-200 ${isSkip ? "text-[#E65100] bg-[#E65100]/10" : "text-[#8A8A98] hover:text-[#E65100] hover:bg-[#E65100]/10"}`}
      >
        <SkipForward size={13} />
        <span>Skip</span>
      </button>
    </div>
  );
}

function SubSectionRow({
  sub,
  stepId,
  expanded,
  onToggle,
  progressState,
  onToggleProb,
  onSkipProb,
  hideSkipped,
  filter,
}) {
  const done = sub.problems.filter(
    (p) => progressState(p.id) === "done",
  ).length;
  const total = sub.problems.length;

  let visible = sub.problems;
  if (hideSkipped) {
    visible = visible.filter((p) => progressState(p.id) !== "skipped");
  }

  if (filter === "done") {
    visible = visible.filter((p) => progressState(p.id) === "done");
  } else if (filter === "skipped") {
    visible = visible.filter((p) => progressState(p.id) === "skipped");
  } else if (filter === "todo") {
    visible = visible.filter((p) => progressState(p.id) === "todo");
  }

  return (
    <div className="ml-4 pl-3 border-l border-[#26262F]">
      <button
        onClick={() => onToggle(sub.id)}
        className="w-full flex items-center gap-2 py-2 text-sm group text-left hover:text-[#E8E8EE] transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium text-[#E8E8EE]">{sub.title}</span>
        <div className="flex-1 mx-2">
          <ProgressBar done={done} total={total} />
        </div>
        <span className="text-xs text-[#8A8A98] tabular-nums">
          {done}/{total}
        </span>
      </button>

      {expanded && (
        <div className="surface-card mt-2 mb-3 bg-[#15151B] rounded-xl border border-[#26262F] p-2">
          {visible.length > 0 ? (
            visible.map((p) => (
              <ProblemRow
                key={p.id}
                prob={p}
                state={progressState(p.id)}
                onToggle={onToggleProb}
                onSkip={onSkipProb}
              />
            ))
          ) : (
            <div className="py-4 text-center text-xs text-[#8A8A98]">
              No problems match the filter
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  progressState,
  expandedSteps,
  onToggleStep,
  expandedSubs,
  onToggleSub,
  onToggleProb,
  onSkipProb,
  hideSkipped,
  filter,
}) {
  const done = step.subsections.reduce(
    (sum, s) =>
      sum + s.problems.filter((p) => progressState(p.id) === "done").length,
    0,
  );
  const total = step.subsections.reduce((sum, s) => sum + s.problems.length, 0);

  return (
    <div className="surface-card rounded-xl bg-[#15151B] border border-[#26262F] overflow-hidden mb-3">
      <button
        onClick={() => onToggleStep(step.id)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#1C1C24] transition-colors"
      >
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          {expandedSteps.has(step.id) ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </div>
        <h2 className="font-semibold text-[17px] text-[#E8E8EE] flex-1">
          {step.title}
        </h2>
        <div className="flex-1 mx-3 hidden md:block">
          <ProgressBar done={done} total={total} />
        </div>
        <span className="text-sm text-[#8A8A98] tabular-nums whitespace-nowrap">
          {done}/{total}
        </span>
      </button>

      <div className="px-4 pb-3">
        {expandedSteps.has(step.id) &&
          step.subsections.map((sub) => (
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

export default App;
