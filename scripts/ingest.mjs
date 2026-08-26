/**
 * Invoke ingest-charts over HTTP. Newer Supabase CLIs dropped `functions invoke`.
 *
 * Usage:
 *   node scripts/ingest.mjs
 *
 * Needs in .env (never VITE_ for the secret — it must not ship to the browser):
 *   VITE_SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SECRET_KEY=sb_secret_...   (Dashboard → Settings → API Keys → Secret)
 * Optional fallback:
 *   SUPABASE_SERVICE_ROLE_KEY=...       (legacy JWT)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv(resolve(process.cwd(), ".env"));

const urlBase = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
  /\/$/,
  "",
);
const secret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const pickSecret = process.env.PICK_DAILY_SECRET ?? "";

if (!urlBase) {
  fail("Falta VITE_SUPABASE_URL en .env (Project URL de Supabase).");
}
if (!secret && !pickSecret) {
  fail(
    [
      "Falta SUPABASE_SECRET_KEY en .env.",
      "Dashboard → Project Settings → API Keys → Secret (sb_secret_...).",
      "No uses el prefijo VITE_ (eso la metería en el frontend). No la subas a GitHub.",
    ].join("\n"),
  );
}

if (secret.startsWith("sb_publishable_")) {
  fail("Esa es la publishable key. Para ingest hace falta la Secret key (sb_secret_...).");
}

const jwtRole = decodeJwtRole(secret);
if (jwtRole === "anon") {
  fail("Pegaste la anon/publishable. Para ingest hace falta la Secret key (sb_secret_...).");
}

const url = `${urlBase}/functions/v1/ingest-charts`;
const headers = { "Content-Type": "application/json" };

if (secret.startsWith("sb_secret_")) {
  headers.apikey = secret;
} else if (secret) {
  headers.Authorization = `Bearer ${secret}`;
  headers.apikey = secret;
}
if (pickSecret) headers["x-pick-secret"] = pickSecret;

const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});
const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = text;
}

if (!res.ok || (parsed && parsed.ok === false)) {
  console.error(typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(parsed, null, 2));
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function decodeJwtRole(token) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
