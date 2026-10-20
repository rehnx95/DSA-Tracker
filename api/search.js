import { createClient } from "@supabase/supabase-js";

const usernamePattern = /^[a-z0-9-]{3,48}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!usernamePattern.test(query)) {
    return res.status(400).json({
      error: "Enter a username prefix using 3 to 48 letters, numbers, or hyphens.",
    });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Sign in to search users." });

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("User search API is missing Supabase environment variables.");
    return res.status(500).json({ error: "User search is not configured." });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: "Your session has expired. Sign in again." });
    }

    const { data, error } = await supabase.rpc("search_public_profiles", {
      search_term: query,
    });
    if (error) throw error;

    return res.status(200).json({
      results: (data || []).slice(0, 5).map(({ username, name }) => ({
        username,
        name,
      })),
    });
  } catch (error) {
    console.error("User search API failed:", error);
    return res.status(500).json({ error: "Could not search users right now." });
  }
}
