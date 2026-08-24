import { createClient } from "npm:@supabase/supabase-js@2";

const ART = "America/Argentina/Buenos_Aires";
const POOLS = ["easy", "medium", "hard", "expert", "impossible"] as const;
type Pool = (typeof POOLS)[number];

interface PickRule {
  pool: Pool;
  min_popularity: number;
  max_popularity: number;
  cooldown_days: number;
  require_preview: boolean;
  spotify_query: string | null;
}

interface SpotifyTrack {
  id: string;
  name: string;
  popularity: number;
  preview_url: string | null;
  artists: { name: string }[];
  external_ids?: { isrc?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }

  try {
    assertAuthorized(req);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = body.force === true;
    const today = artDate();
    const targets = resolveTargets(body.target, today);

    const supabase = createClient(mustEnv("SUPABASE_URL"), adminKey());
    const token = await spotifyToken();

    const { data: rules, error: rulesError } = await supabase
      .from("pick_rules")
      .select("*");
    if (rulesError) throw rulesError;

    const results: Record<string, unknown>[] = [];
    for (const date of targets) {
      for (const pool of POOLS) {
        const rule = (rules ?? []).find((r) => r.pool === pool) as PickRule | undefined;
        if (!rule) throw new Error(`missing pick_rules for ${pool}`);
        const row = await pickPool(supabase, token, pool, date, rule, force);
        results.push(row);
      }
    }

    return json({ ok: true, dates: targets, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, 400);
  }
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-pick-secret",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

function mustEnv(key: string): string {
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

function adminKey(): string {
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

function assertAuthorized(req: Request) {
  const cronSecret = Deno.env.get("PICK_DAILY_SECRET") ?? "";
  const headerSecret = req.headers.get("x-pick-secret") ?? "";
  if (cronSecret && headerSecret === cronSecret) return;

  const allowed = allowedSecrets();
  for (const token of presentedTokens(req)) {
    if (allowed.includes(token)) return;
  }
  throw new Error("unauthorized");
}

function artDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function resolveTargets(target: unknown, today: string): string[] {
  if (target === "today") return [today];
  if (target === "tomorrow") return [addDays(today, 1)];
  if (typeof target === "string" && /^\d{4}-\d{2}-\d{2}$/.test(target)) return [target];
  return [today, addDays(today, 1)];
}

async function spotifyToken(): Promise<string> {
  const id = mustEnv("SPOTIFY_CLIENT_ID");
  const secret = mustEnv("SPOTIFY_CLIENT_SECRET");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`spotify token ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

async function pickPool(
  supabase: ReturnType<typeof createClient>,
  token: string,
  pool: Pool,
  date: string,
  rule: PickRule,
  force: boolean,
) {
  if (force) {
    await supabase.from("daily_picks").delete().eq("date", date).eq("pool", pool);
  }

  const { data: existing } = await supabase
    .from("daily_picks")
    .select("song_id")
    .eq("date", date)
    .eq("pool", pool)
    .maybeSingle();
  if (existing?.song_id) {
    return { date, pool, status: "already_set", song_id: existing.song_id };
  }

  const blocked = await recentSpotifyIds(supabase, date, rule.cooldown_days);
  const found = await searchSpotify(token, rule, blocked);
  if (!found.track) {
    return { date, pool, status: "no_candidate", detail: found.detail };
  }
  const track = found.track;

  const preview =
    track.preview_url ??
    (await deezerPreview(track.external_ids?.isrc)) ??
    (await itunesPreview(track.name, track.artists[0]?.name ?? ""));

  if (rule.require_preview && !preview) {
    return { date, pool, status: "no_preview", spotify_id: track.id };
  }

  const artist = track.artists.map((a) => a.name).join(", ");
  const payload = {
    title: track.name,
    artist,
    pool,
    popularity: track.popularity,
    preview_url: preview,
    isrc: track.external_ids?.isrc ?? null,
    spotify_id: track.id,
    lang: "und",
  };

  let { data: song, error: upsertError } = await supabase
    .from("songs")
    .upsert(payload, { onConflict: "spotify_id" })
    .select("id")
    .single();

  if (upsertError && payload.isrc) {
    const retry = await supabase
      .from("songs")
      .upsert({ ...payload, isrc: null }, { onConflict: "spotify_id" })
      .select("id")
      .single();
    song = retry.data;
    upsertError = retry.error;
  }
  if (upsertError || !song) {
    throw new Error(upsertError?.message ?? `upsert failed for ${track.id}`);
  }

  const { error: pickError } = await supabase.from("daily_picks").insert({
    date,
    pool,
    song_id: song.id,
  });
  if (pickError) throw new Error(pickError.message);

  return {
    date,
    pool,
    status: "picked",
    song_id: song.id,
    title: track.name,
    artist,
    popularity: track.popularity,
  };
}

async function recentSpotifyIds(
  supabase: ReturnType<typeof createClient>,
  date: string,
  cooldownDays: number,
): Promise<Set<string>> {
  const from = addDays(date, -cooldownDays);
  const { data } = await supabase
    .from("daily_picks")
    .select("date, songs!inner(spotify_id)")
    .gte("date", from)
    .lt("date", date);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const songs = (row as { songs: { spotify_id: string | null } | { spotify_id: string | null }[] }).songs;
    const s = Array.isArray(songs) ? songs[0] : songs;
    if (s?.spotify_id) ids.add(s.spotify_id);
  }
  return ids;
}

const SEARCH_LIMIT = 10;

const ERA_AGNOSTIC_QUERIES = [
  "love",
  "vida",
  "noche",
  "heart",
  "time",
  "baby",
  "que",
  "sun",
  "fire",
  "mundo",
  "dance",
  "girl",
];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function searchQueries(rule: PickRule): string[] {
  const custom = rule.spotify_query?.trim() ?? "";
  const extra = custom && !/\byear:\d{4}/.test(custom) ? [custom] : [];
  return shuffle([...extra, ...ERA_AGNOSTIC_QUERIES]);
}

function pickMatch(items: SpotifyTrack[], rule: PickRule, blocked: Set<string>, relaxPop: boolean) {
  const matches = items.filter((t) => {
    if (!t?.id || blocked.has(t.id)) return false;
    if (!relaxPop && (t.popularity < rule.min_popularity || t.popularity > rule.max_popularity)) {
      return false;
    }
    return true;
  });
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

async function spotifySearchPage(
  token: string,
  q: string,
  offset: number,
  retries = 0,
): Promise<{ items: SpotifyTrack[]; total: number; status: number; error?: string }> {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("market", "AR");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 && retries < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? "1") * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return spotifySearchPage(token, q, offset, retries + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body.slice(0, 180);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* keep raw */
    }
    return { items: [], total: 0, status: res.status, error: message };
  }
  const data = await res.json();
  const items = ((data.tracks?.items ?? []) as SpotifyTrack[]).filter(Boolean);
  return {
    items: await hydrateTracks(token, items),
    total: Number(data.tracks?.total ?? 0),
    status: res.status,
  };
}

async function hydrateTracks(token: string, items: SpotifyTrack[]): Promise<SpotifyTrack[]> {
  const ids = items.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return items;
  const url = new URL("https://api.spotify.com/v1/tracks");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("market", "AR");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return items;
  const data = await res.json();
  const full = ((data.tracks ?? []) as (SpotifyTrack | null)[]).filter((t): t is SpotifyTrack => Boolean(t));
  return full.length > 0 ? full : items;
}

async function searchSpotify(
  token: string,
  rule: PickRule,
  blocked: Set<string>,
): Promise<{ track: SpotifyTrack | null; detail: string }> {
  const queries = searchQueries(rule);
  let lastStatus = 0;
  let lastTotal = 0;
  let lastError = "";

  for (const relaxPop of [false, true]) {
    for (const q of queries) {
      const first = await spotifySearchPage(token, q, 0);
      lastStatus = first.status;
      lastTotal = first.total;
      if (first.error) lastError = first.error;
      if (first.status >= 400) continue;
      let hit = pickMatch(first.items, rule, blocked, relaxPop);
      if (hit) return { track: hit, detail: q };

      const cap = Math.min(first.total, 1000 - SEARCH_LIMIT);
      const offsets: number[] = [];
      for (let offset = SEARCH_LIMIT; offset < cap; offset += SEARCH_LIMIT) offsets.push(offset);
      for (const offset of shuffle(offsets).slice(0, 8)) {
        const page = await spotifySearchPage(token, q, offset);
        lastStatus = page.status;
        if (page.error) lastError = page.error;
        if (page.status >= 400) continue;
        hit = pickMatch(page.items, rule, blocked, relaxPop);
        if (hit) return { track: hit, detail: q };
      }
    }
  }

  return {
    track: null,
    detail: `empty status=${lastStatus} total=${lastTotal}${lastError ? ` error=${lastError}` : ""}`,
  };
}

async function deezerPreview(isrc?: string): Promise<string | null> {
  if (!isrc) return null;
  try {
    const res = await fetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.preview === "string" && data.preview.length > 0 ? data.preview : null;
  } catch {
    return null;
  }
}

async function itunesPreview(title: string, artist: string): Promise<string | null> {
  try {
    const term = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5`);
    if (!res.ok) return null;
    const data = await res.json();
    const targetTitle = normalizeMediaLabel(title);
    const targetArtist = normalizeMediaLabel(artist.split(/,|&|\bfeat\.?\b/i)[0]);
    const match = (data.results ?? []).find((item: Record<string, unknown>) => {
      const candidateTitle = normalizeMediaLabel(String(item.trackName ?? ""));
      const candidateArtist = normalizeMediaLabel(String(item.artistName ?? ""));
      const titleMatches =
        candidateTitle.length > 0 &&
        (candidateTitle === targetTitle ||
          candidateTitle.includes(targetTitle) ||
          targetTitle.includes(candidateTitle));
      return (
        typeof item.previewUrl === "string" &&
        titleMatches &&
        targetArtist.length > 0 &&
        candidateArtist.includes(targetArtist)
      );
    });
    return typeof match?.previewUrl === "string" ? match.previewUrl : null;
  } catch {
    return null;
  }
}

function normalizeMediaLabel(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
