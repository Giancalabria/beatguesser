import { createClient } from "npm:@supabase/supabase-js@2";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

interface RateBucket {
  startedAt: number;
  count: number;
}

interface SongRow {
  id: string;
  title: string;
  artist: string;
  isrc: string | null;
  preview_url: string | null;
}

const rateBuckets = new Map<string, RateBucket>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    enforceRateLimit(req);
    const body = await req.json().catch(() => ({}));
    const songId = typeof body.songId === "string" ? body.songId.trim() : "";
    if (!isUuid(songId)) {
      return json({ error: "invalid_song_id" }, 400);
    }

    const supabase = createClient(mustEnv("SUPABASE_URL"), publishableKey(), {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, artist, isrc, preview_url")
      .eq("id", songId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ error: "song_not_found" }, 404);

    const song = data as SongRow;

    // iTunes previews are stable. Prefer them over Deezer's signed CDN URLs.
    const itunes = await itunesPreview(song.title, song.artist);
    if (itunes) {
      return json({ previewUrl: itunes, source: "itunes" });
    }

    // Deezer returns a short-lived signed URL, so resolve it for every session.
    const deezer = await deezerPreview(song.isrc ?? undefined);
    if (deezer) {
      return json({
        previewUrl: deezer,
        source: "deezer",
        expiresAt: signedUrlExpiration(deezer),
      });
    }

    // Keep a non-Deezer persisted URL as a final fallback.
    if (song.preview_url && !isTemporaryDeezerUrl(song.preview_url)) {
      return json({ previewUrl: song.preview_url, source: "stored" });
    }

    return json({ error: "preview_not_found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "rate_limited") {
      return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
    }
    console.error("[resolve-preview]", message);
    return json({ error: "preview_unavailable" }, 502);
  }
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isTemporaryDeezerUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLocaleLowerCase().endsWith("dzcdn.net");
  } catch {
    return false;
  }
}

function signedUrlExpiration(value: string): string | null {
  try {
    const policy = new URL(value).searchParams.get("hdnea") ?? "";
    const match = policy.match(/(?:^|~)exp=(\d+)(?:~|$)/);
    if (!match) return null;
    return new Date(Number(match[1]) * 1000).toISOString();
  } catch {
    return null;
  }
}

async function deezerPreview(isrc?: string): Promise<string | null> {
  if (!isrc) return null;
  try {
    const response = await fetch(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
    );
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.preview === "string" && body.preview.length > 0
      ? body.preview
      : null;
  } catch {
    return null;
  }
}

async function itunesPreview(title: string, artist: string): Promise<string | null> {
  try {
    const term = encodeURIComponent(`${title} ${artist}`);
    const response = await fetch(
      `https://itunes.apple.com/search?term=${term}&entity=song&country=AR&limit=25`,
    );
    if (!response.ok) return null;
    const body = await response.json();
    const targetTitle = normalizeMediaLabel(title);
    const targetArtist = normalizeMediaLabel(artist.split(/,|&|\bfeat\.?\b/i)[0]);
    const match = (body.results ?? []).find((item: Record<string, unknown>) => {
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

function publishableKey(): string {
  const keys = parseNamedKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  if (keys.default) return keys.default;
  const first = Object.values(keys)[0];
  if (first) return first;
  return mustEnv("SUPABASE_ANON_KEY");
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
    return {};
  }
  return {};
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
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

  if (rateBuckets.size > 2_000) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
