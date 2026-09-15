// Loads secrets for the server-side scripts from a git-ignored .env.scripts, so
// you don't have to paste the service-role key every session. Import it FIRST in
// any script that needs Supabase admin access:  import "./_env.mjs";
//
// .env.scripts lives in the project root and holds (at minimum):
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
// SUPABASE_URL is derived from .env's VITE_SUPABASE_URL automatically.
//
// Real environment variables always win, so CI or an inline `$env:...=...` still
// override the file. This never touches the deployed app — .env.scripts is
// git-ignored and never bundled (no VITE_ prefix reaches the client).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const parse = (file) => {
  let text;
  try { text = readFileSync(join(root, file), "utf8"); } catch { return {}; }
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
};

const scripts = parse(".env.scripts");
const app = parse(".env");

// .env.scripts fills in anything not already set in the real environment.
for (const [k, v] of Object.entries(scripts)) if (process.env[k] === undefined) process.env[k] = v;

// Convenience: the app stores the project URL as VITE_SUPABASE_URL; reuse it.
if (!process.env.SUPABASE_URL)
  process.env.SUPABASE_URL = scripts.VITE_SUPABASE_URL || app.VITE_SUPABASE_URL || "";

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`
Missing ${missing.join(", ")}.

Create a git-ignored .env.scripts in the project root with:

  SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret

(SUPABASE_URL is taken from .env's VITE_SUPABASE_URL automatically.)
Get the key: Supabase dashboard -> Project Settings -> API -> service_role (secret).
It bypasses RLS — never commit it or give it a VITE_ prefix.
`);
  process.exit(1);
}
