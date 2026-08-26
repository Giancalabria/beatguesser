export function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-pick-secret",
  };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

export function mustEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`missing env ${key}`);
  return v;
}

function parseNamedKeys(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.length > 0) out[name] = value;
      }
      return out;
    }
  } catch {
    if (raw.startsWith("sb_secret_")) return { default: raw };
  }
  return {};
}

export function adminKey(): string {
  const secrets = parseNamedKeys(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (secrets.default) return secrets.default;
  const first = Object.values(secrets)[0];
  if (first) return first;
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacy) return legacy;
  throw new Error("missing admin key (create a secret API key in the dashboard)");
}

function allowedSecrets(): string[] {
  const keys = Object.values(parseNamedKeys(Deno.env.get("SUPABASE_SECRET_KEYS")));
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacy) keys.push(legacy);
  return keys;
}

function presentedTokens(req: Request): string[] {
  const apikey = (req.headers.get("apikey") ?? "").trim();
  const auth = (req.headers.get("Authorization") ?? "").trim();
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
  return [apikey, bearer].filter((v) => v.length > 0);
}

export function assertAuthorized(req: Request) {
  const cronSecret = Deno.env.get("PICK_DAILY_SECRET") ?? "";
  const headerSecret = req.headers.get("x-pick-secret") ?? "";
  if (cronSecret && headerSecret === cronSecret) return;

  const allowed = allowedSecrets();
  for (const token of presentedTokens(req)) {
    if (allowed.includes(token)) return;
  }
  throw new Error("unauthorized");
}
