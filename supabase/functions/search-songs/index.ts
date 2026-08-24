const DEFAULT_MARKET = "AR";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 12;
const CACHE_TTL_MS = 5 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
}

interface SearchResult {
  spotifyId: string;
  title: string;
  artist: string;
}

interface CachedSearch {
  expiresAt: number;
  results: SearchResult[];
}

interface RateBucket {
  startedAt: number;
  count: number;
}

let tokenCache: { value: string; expiresAt: number } | null = null;
const searchCache = new Map<string, CachedSearch>();
const rateBuckets = new Map<string, RateBucket>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    enforceRateLimit(req);
    const input = await searchInput(req);
    const cacheKey = `${input.market}:${input.limit}:${input.query.toLocaleLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return json({ results: cached.results, cached: true });
    }

    const token = await spotifyToken();
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", input.query);
    url.searchParams.set("type", "track");
    url.searchParams.set("market", input.market);
    url.searchParams.set("limit", String(input.limit));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") ?? "1";
      return json(
        { error: "rate_limited", retryAfter: Number(retryAfter) || 1 },
        429,
        { "Retry-After": retryAfter },
      );
    }
    if (!response.ok) {
      throw new Error(`spotify search failed (${response.status})`);
    }

    const body = await response.json();
    const tracks = (body.tracks?.items ?? []) as SpotifyTrack[];
    const results = tracks
      .filter((track) => track?.id && track.name && track.artists?.length)
      .map((track) => ({
        spotifyId: track.id,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(", "),
      }));

    trimCaches();
    searchCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      results,
    });

    return json({ results, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "rate_limited") {
      return json({ error: "rate_limited", retryAfter: 60 }, 429, {
        "Retry-After": "60",
      });
    }
    if (
      message === "query_too_short" ||
      message === "query_too_long" ||
      message === "invalid_market"
    ) {
      return json({ error: message }, 400);
    }
    console.error("[search-songs]", message);
    return json({ error: "search_unavailable" }, 502);
  }
});

async function searchInput(
  req: Request,
): Promise<{ query: string; market: string; limit: number }> {
  let query: unknown;
  let market: unknown;
  let limit: unknown;

  if (req.method === "GET") {
    const url = new URL(req.url);
    query = url.searchParams.get("q");
    market = url.searchParams.get("market");
    limit = url.searchParams.get("limit");
  } else {
    const body = await req.json().catch(() => ({}));
    query = body.q;
    market = body.market;
    limit = body.limit;
  }

  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (normalizedQuery.length < 2) throw new Error("query_too_short");
  if (normalizedQuery.length > 80) throw new Error("query_too_long");

  const normalizedMarket =
    typeof market === "string" && market.trim()
      ? market.trim().toUpperCase()
      : DEFAULT_MARKET;
  if (!/^[A-Z]{2}$/.test(normalizedMarket)) {
    throw new Error("invalid_market");
  }

  const parsedLimit = Number(limit ?? DEFAULT_LIMIT);
  const normalizedLimit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsedLimit)))
    : DEFAULT_LIMIT;

  return {
    query: normalizedQuery,
    market: normalizedMarket,
    limit: normalizedLimit,
  };
}

function enforceRateLimit(req: Request): void {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwarded ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) throw new Error("rate_limited");
}

async function spotifyToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.value;
  }

  const clientId = mustEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = mustEnv("SPOTIFY_CLIENT_SECRET");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    throw new Error(`spotify token failed (${response.status})`);
  }

  const body = await response.json();
  const token = String(body.access_token ?? "");
  const expiresIn = Number(body.expires_in ?? 3600);
  if (!token) throw new Error("spotify token missing");

  tokenCache = {
    value: token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return token;
}

function trimCaches(): void {
  const now = Date.now();
  for (const [key, value] of searchCache) {
    if (value.expiresAt <= now) searchCache.delete(key);
  }
  for (const [key, value] of rateBuckets) {
    if (now - value.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
  }

  while (searchCache.size > 250) {
    const oldest = searchCache.keys().next().value;
    if (typeof oldest !== "string") break;
    searchCache.delete(oldest);
  }
  while (rateBuckets.size > 2_000) {
    const oldest = rateBuckets.keys().next().value;
    if (typeof oldest !== "string") break;
    rateBuckets.delete(oldest);
  }
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
