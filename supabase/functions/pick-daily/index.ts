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
      const sessionBlocked = new Set<string>();
      for (const pool of POOLS) {
        const rule = (rules ?? []).find((r) => r.pool === pool) as PickRule | undefined;
        if (!rule) throw new Error(`missing pick_rules for ${pool}`);
        const row = await pickPool(supabase, token, pool, date, rule, force, sessionBlocked);
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
  sessionBlocked: Set<string>,
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
    const { data: existingSong } = await supabase
      .from("songs")
      .select("spotify_id, title, artist")
      .eq("id", existing.song_id)
      .maybeSingle();
    if (existingSong?.spotify_id) sessionBlocked.add(existingSong.spotify_id);
    if (existingSong?.title) sessionBlocked.add(songKey(existingSong.title, existingSong.artist ?? ""));
    return { date, pool, status: "already_set", song_id: existing.song_id };
  }

  const blocked = new Set([
    ...(await recentSpotifyIds(supabase, date, rule.cooldown_days)),
    ...sessionBlocked,
  ]);
  const found = await searchSpotify(token, rule, blocked);
  if (!found.track) {
    return { date, pool, status: "no_candidate", detail: found.detail };
  }
  const track = found.track;
  sessionBlocked.add(track.id);
  sessionBlocked.add(trackKey(track));

  const preview =
    track.preview_url ??
    (await itunesPreview(track.name, track.artists[0]?.name ?? "")) ??
    (await deezerPreview(track.external_ids?.isrc));

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
    .select("date, songs!inner(spotify_id, title, artist)")
    .gte("date", from)
    .lt("date", date);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const songs = (row as {
      songs:
        | { spotify_id: string | null; title?: string; artist?: string }
        | { spotify_id: string | null; title?: string; artist?: string }[];
    }).songs;
    const s = Array.isArray(songs) ? songs[0] : songs;
    if (s?.spotify_id) ids.add(s.spotify_id);
    if (s?.title) ids.add(songKey(s.title, s.artist ?? ""));
  }
  return ids;
}

const SEARCH_LIMIT = 10;
const PLAYLIST_LIMIT = 10;
const SPOTIFY_MARKET = "US";
const POPULARITY_FLOOR = 48;

/** Official Spotify editorial playlists of worldwide hits, any era. */
const GLOBAL_HIT_PLAYLISTS = [
  "37i9dQZEVXbMDoHDwVN2tF", // Top 50 – Global
  "37i9dQZEVXbNG2KDcFcKOF", // Top Songs – Global
  "37i9dQZF1DXcBWIGoYBM5M", // Today's Top Hits
  "37i9dQZF1DXbYM3nMM0oPk", // Mega Hit Mix
  "37i9dQZF1DWWMOmoXKqHTD", // Songs to Sing in the Car
  "37i9dQZF1DXc6IFF23C9jj", // All Out 2010s
  "37i9dQZF1DX4o1oenSJRJd", // All Out 2000s
  "37i9dQZF1DXbTxeAdrVG2l", // All Out 90s
  "37i9dQZF1DX4UtSsGT1Sbe", // All Out 80s
  "37i9dQZF1DWTJ7xPn4vNaz", // All Out 70s
];

const GLOBAL_SEARCH_QUERIES = [
  'artist:"The Weeknd"',
  'artist:"Taylor Swift"',
  'artist:"Ed Sheeran"',
  'artist:"Billie Eilish"',
  'artist:"Dua Lipa"',
  'artist:"Bruno Mars"',
  'artist:"Coldplay"',
  'artist:"Adele"',
  'artist:"Lady Gaga"',
  'artist:"Imagine Dragons"',
];

let hitCatalog: SpotifyTrack[] | null = null;

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
  return shuffle([...extra, ...GLOBAL_SEARCH_QUERIES]);
}

function popularityWindow(rule: PickRule, relaxPop: boolean) {
  const min = Math.max(
    POPULARITY_FLOOR,
    relaxPop ? rule.min_popularity - 8 : rule.min_popularity,
  );
  let max = Math.min(100, relaxPop ? rule.max_popularity + 8 : rule.max_popularity);
  if (min > max) max = Math.min(100, min + 12);
  return { min, max };
}

function songKey(title: string, artist: string): string {
  return `title:${title.toLocaleLowerCase().trim()}::${artist.toLocaleLowerCase().split(",")[0]?.trim() ?? ""}`;
}

function trackKey(track: SpotifyTrack): string {
  return songKey(track.name, track.artists[0]?.name ?? "");
}

function artistMatchesQuery(track: SpotifyTrack, q: string): boolean {
  const artistFilter = q.match(/artist:"([^"]+)"/i)?.[1] ?? q;
  const needle = artistFilter.toLocaleLowerCase().trim();
  return track.artists.some((artist) => {
    const name = artist.name.toLocaleLowerCase();
    return name === needle || name.includes(needle) || needle.includes(name);
  });
}

function pickMatch(items: SpotifyTrack[], rule: PickRule, blocked: Set<string>, relaxPop: boolean) {
  const eligible = items.filter((t) => {
    if (!t?.id || blocked.has(t.id) || blocked.has(trackKey(t))) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const { min, max } = popularityWindow(rule, relaxPop);
  const byPopularity = eligible
    .filter((t) => Number.isFinite(t.popularity) && t.popularity > 0)
    .filter((t) => t.popularity >= min && t.popularity <= max)
    .sort((a, b) => b.popularity - a.popularity);
  if (byPopularity.length > 0) {
    const top = byPopularity.slice(0, Math.min(3, byPopularity.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  // Spotify sometimes omits popularity on client-credentials responses.
  // Fall back to search/playlist order: earlier results are the famous hits.
  const rank: Record<Pool, [number, number]> = {
    easy: [0, 2],
    medium: [1, 4],
    hard: [2, 6],
    expert: [4, 8],
    impossible: [6, 10],
  };
  const [from, to] = rank[rule.pool];
  const slice = eligible.slice(from, Math.max(to, from + 1));
  const choices = slice.length > 0 ? slice : eligible.slice(0, 3);
  return choices[Math.floor(Math.random() * choices.length)];
}

async function spotifyGet(
  token: string,
  url: string,
  retries = 0,
): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 && retries < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? "1") * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return spotifyGet(token, url, retries + 1);
  }
  return res;
}

async function spotifySearchPage(
  token: string,
  q: string,
  offset: number,
): Promise<{ items: SpotifyTrack[]; total: number; status: number; error?: string }> {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("market", SPOTIFY_MARKET);
  const res = await spotifyGet(token, url.toString());
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
  const ids = [...new Set(items.map((t) => t.id).filter(Boolean))];
  if (ids.length === 0) return items;
  const byId = new Map<string, SpotifyTrack>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://api.spotify.com/v1/tracks?market=${SPOTIFY_MARKET}&ids=${chunk.join(",")}`;
    const res = await spotifyGet(token, url);
    if (!res.ok) continue;
    const data = await res.json();
    for (const track of (data.tracks ?? []) as (SpotifyTrack | null)[]) {
      if (track?.id) byId.set(track.id, track);
    }
  }
  return items.map((item) => byId.get(item.id) ?? item);
}

async function playlistTracks(token: string, playlistId: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let next: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?market=${SPOTIFY_MARKET}&limit=${PLAYLIST_LIMIT}`;
  for (let pages = 0; next && pages < 3; pages += 1) {
    const res = await spotifyGet(token, next);
    if (!res.ok) break;
    const data = await res.json() as {
      items?: Array<{ track?: SpotifyTrack | null }>;
      next?: string | null;
    };
    for (const item of data.items ?? []) {
      const track = item.track;
      if (track?.id && track.name && track.artists?.length) tracks.push(track);
    }
    next = data.next ?? null;
  }
  return tracks;
}

async function globalHitCatalog(token: string): Promise<SpotifyTrack[]> {
  if (hitCatalog && hitCatalog.length > 0) return hitCatalog;
  const byId = new Map<string, SpotifyTrack>();
  for (let i = 0; i < GLOBAL_HIT_PLAYLISTS.length; i += 3) {
    const chunk = GLOBAL_HIT_PLAYLISTS.slice(i, i + 3);
    const pages = await Promise.all(chunk.map((id) => playlistTracks(token, id)));
    for (const tracks of pages) {
      for (const track of tracks) byId.set(track.id, track);
    }
  }
  hitCatalog = await hydrateTracks(token, [...byId.values()]);
  return hitCatalog;
}

async function searchSpotify(
  token: string,
  rule: PickRule,
  blocked: Set<string>,
): Promise<{ track: SpotifyTrack | null; detail: string }> {
  const catalog = await globalHitCatalog(token);
  const fromPlaylists = pickMatch(catalog, rule, blocked, false)
    ?? pickMatch(catalog, rule, blocked, true);
  if (fromPlaylists) {
    return { track: fromPlaylists, detail: "global-hits" };
  }

  const queries = searchQueries(rule);
  let lastStatus = 0;
  let lastTotal = 0;
  let lastError = "";

  for (const relaxPop of [false, true]) {
    for (const q of queries.slice(0, 6)) {
      const page = await spotifySearchPage(token, q, 0);
      lastStatus = page.status;
      lastTotal = page.total;
      if (page.error) lastError = page.error;
      if (page.status >= 400) continue;
      const hit = pickMatch(
        page.items.filter((track) => artistMatchesQuery(track, q)),
        rule,
        blocked,
        relaxPop,
      );
      if (hit) return { track: hit, detail: q };
    }
  }

  return {
    track: null,
    detail: `empty catalog=${catalog.length} status=${lastStatus} total=${lastTotal}${lastError ? ` error=${lastError}` : ""}`,
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
  const targetTitle = normalizeMediaLabel(title);
  const targetArtist = normalizeMediaLabel(artist.split(/,|&|\bfeat\.?\b/i)[0]);
  const term = encodeURIComponent(`${title} ${artist}`);
  for (const country of ["US", "AR"]) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${term}&entity=song&country=${country}&limit=25`,
      );
      if (!res.ok) continue;
      const data = await res.json();
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
      if (typeof match?.previewUrl === "string") return match.previewUrl;
    } catch {
      /* try next storefront */
    }
  }
  return null;
}

function normalizeMediaLabel(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
