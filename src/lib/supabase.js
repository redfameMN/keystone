import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Without env vars the app runs on the in-memory seed data (see App.jsx).
export const hasSupabase = Boolean(url && key && !url.includes("xxxx"));
export const supabase = hasSupabase ? createClient(url, key) : null;
