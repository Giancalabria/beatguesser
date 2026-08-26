import { createClient } from "npm:@supabase/supabase-js@2";
import { adminKey, assertAuthorized, cors, json, mustEnv } from "../_shared/auth.ts";
import {
  ALL_MARKETS,
  bestRankForBoard,
  classifyBoards,
  LANG_MODES,
  poolFromBestRank,
  type LangMode,
} from "../_shared/charts.ts";

const ART = "America/Argentina/Buenos_Aires";

interface ChartSong {
  id?: string;
  artistName?: string;
  name?: string;
  genres?: Array<{ genreId?: string }>;
}

interface LookupTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  trackExplicitness?: string;
  primaryGenreName?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }

  try {
    assertAuthorized(req);
    const supabase = createClient(mustEnv("SUPABASE_URL"), adminKey());
    const capturedOn = artDate();
    const marketStats: Record<string, number> = {};
    const seen = new Map<
      string,
      {
        title: string;
        artist: string;
        genreIds: Set<string>;
        ranks: Map<string, number>;
      }
    >();
    const chartRows: Array<{
      market: string;
      apple_id: string;
      rank: number;
      captured_on: string;
      title: string;
      artist: string;
      genre_ids: string[];
    }> = [];

    for (const market of ALL_MARKETS) {
      const songs = await fetchChart(market);
      marketStats[market] = songs.length;
      for (let i = 0; i < songs.length; i += 1) {
        const song = songs[i];
        const appleId = song.id?.trim();
        const title = song.name?.trim();
        const artist = song.artistName?.trim();
        if (!appleId || !title || !artist) continue;
        const rank = i + 1;
        const genreIds = (song.genres ?? [])
          .map((g) => g.genreId)
          .filter((id): id is string => Boolean(id));

        chartRows.push({
          market,
          apple_id: appleId,
          rank,
          captured_on: capturedOn,
          title,
          artist,
          genre_ids: genreIds,
        });

        const current = seen.get(appleId) ?? {
          title,
          artist,
          genreIds: new Set<string>(),
          ranks: new Map<string, number>(),
        };
        current.title = title;
        current.artist = artist;
        for (const id of genreIds) current.genreIds.add(id);
        const prev = current.ranks.get(market);
        if (prev == null || rank < prev) current.ranks.set(market, rank);
        seen.set(appleId, current);
      }
    }

    // Upsert chart entries
    for (let i = 0; i < chartRows.length; i += 200) {
      const chunk = chartRows.slice(i, i + 200);
      const { error } = await supabase.from("chart_entries").upsert(chunk);
      if (error) throw new Error(`chart_entries upsert failed: ${error.message}`);
    }

    // Lookup metadata & previews from iTunes
    const lookups = await lookupTracks([...seen.keys()]);

    // Prepare batch song payloads
    const songPayloads: Array<{
      apple_id: string;
      title: string;
      artist: string;
      preview_url: string | null;
      artwork_url: string | null;
      explicit: boolean;
      duration_ms: number | null;
      lang: string;
      pool: string;
    }> = [];

    for (const [appleId, meta] of seen) {
      const lookup = lookups.get(appleId);
      songPayloads.push({
        apple_id: appleId,
        title: lookup?.trackName ?? meta.title,
        artist: lookup?.artistName ?? meta.artist,
        preview_url: lookup?.previewUrl ?? null,
        artwork_url: lookup?.artworkUrl100 ?? null,
        explicit: lookup?.trackExplicitness === "explicit",
        duration_ms: lookup?.trackTimeMillis ?? null,
        lang: "und",
        pool: poolFromBestRank(Math.min(...meta.ranks.values())),
      });
    }

    // Batch upsert songs (100 at a time)
    const appleToSongId = new Map<string, string>();
    let upserted = 0;
    for (let i = 0; i < songPayloads.length; i += 100) {
      const chunk = songPayloads.slice(i, i + 100);
      const { data, error } = await supabase
        .from("songs")
        .upsert(chunk, { onConflict: "apple_id" })
        .select("id, apple_id");
      if (error) throw new Error(`songs upsert failed: ${error.message}`);
      for (const row of data ?? []) {
        if (row.apple_id && row.id) {
          appleToSongId.set(row.apple_id, row.id);
        }
      }
      upserted += (data ?? []).length;
    }

    // Fetch all historical chart entries to compute best ranks
    const history = await fetchAll<{
      market: string;
      apple_id: string;
      rank: number;
      captured_on: string;
      genre_ids: string[] | null;
    }>(supabase, "chart_entries", "market, apple_id, rank, captured_on, genre_ids");

    const byApple = new Map<
      string,
      {
        markets: Set<string>;
        genreIds: Set<string>;
        ranks: Map<string, number>;
        days: Set<string>;
        lastSeen: string;
      }
    >();
    for (const row of history) {
      const appleId = row.apple_id as string;
      const agg = byApple.get(appleId) ?? {
        markets: new Set<string>(),
        genreIds: new Set<string>(),
        ranks: new Map<string, number>(),
        days: new Set<string>(),
        lastSeen: row.captured_on as string,
      };
      agg.markets.add(row.market as string);
      agg.days.add(row.captured_on as string);
      if (row.captured_on > agg.lastSeen) agg.lastSeen = row.captured_on as string;
      for (const id of (row.genre_ids as string[] | null) ?? []) agg.genreIds.add(id);
      const rank = row.rank as number;
      const prev = agg.ranks.get(row.market as string);
      if (prev == null || rank < prev) agg.ranks.set(row.market as string, rank);
      byApple.set(appleId, agg);
    }

    const overrides = await fetchAll<{
      id: string;
      apple_id: string | null;
      lang_override: LangMode | null;
    }>(supabase, "songs", "id, apple_id, lang_override");
    const overrideByApple = new Map<string, LangMode | null>();
    const idByApple = new Map<string, string>();
    for (const row of overrides) {
      if (!row.apple_id) continue;
      idByApple.set(row.apple_id, row.id);
      overrideByApple.set(row.apple_id, (row.lang_override as LangMode | null) ?? null);
    }

    const poolRows: Array<{
      lang: LangMode;
      song_id: string;
      pool: string;
      best_rank: number;
      chart_days: number;
      last_seen: string;
    }> = [];

    for (const [appleId, agg] of byApple) {
      const songId = idByApple.get(appleId) ?? appleToSongId.get(appleId);
      if (!songId) continue;
      const boards = classifyBoards({
        markets: agg.markets,
        genreIds: agg.genreIds,
        override: overrideByApple.get(appleId),
      });
      for (const board of boards) {
        const best = bestRankForBoard(board, agg.ranks);
        if (best == null) continue;
        poolRows.push({
          lang: board,
          song_id: songId,
          pool: poolFromBestRank(best),
          best_rank: best,
          chart_days: agg.days.size,
          last_seen: agg.lastSeen,
        });
      }
    }

    // Deduplicate pool rows by (lang, song_id)
    const poolRowMap = new Map<string, (typeof poolRows)[0]>();
    for (const row of poolRows) {
      poolRowMap.set(`${row.lang}:${row.song_id}`, row);
    }
    const dedupedPoolRows = [...poolRowMap.values()];

    const { error: deleteError } = await supabase
      .from("pool_songs")
      .delete()
      .in("lang", [...LANG_MODES]);
    if (deleteError) throw new Error(`pool_songs delete failed: ${deleteError.message}`);

    for (let i = 0; i < dedupedPoolRows.length; i += 200) {
      const chunk = dedupedPoolRows.slice(i, i + 200);
      const { error } = await supabase.from("pool_songs").insert(chunk);
      if (error) throw new Error(`pool_songs insert failed: ${error.message}`);
    }

    return json({
      ok: true,
      captured_on: capturedOn,
      markets: marketStats,
      songs_upserted: upserted,
      pool_rows: dedupedPoolRows.length,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object"
          ? JSON.stringify(err)
          : String(err);
    return json({ ok: false, error: message }, 400);
  }
});

function artDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw new Error(`fetchAll ${table} failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function fetchChart(market: string): Promise<ChartSong[]> {
  const url = `https://rss.marketingtools.apple.com/api/v2/${market}/music/most-played/100/songs.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`chart ${market} HTTP ${res.status}`);
  const data = (await res.json()) as { feed?: { results?: ChartSong[] } };
  return data.feed?.results ?? [];
}

async function lookupTracks(appleIds: string[]): Promise<Map<string, LookupTrack>> {
  const out = new Map<string, LookupTrack>();
  const chunks: string[][] = [];
  for (let i = 0; i < appleIds.length; i += 50) {
    chunks.push(appleIds.slice(i, i + 50));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = new URL("https://itunes.apple.com/lookup");
        url.searchParams.set("id", chunk.join(","));
        url.searchParams.set("entity", "song");
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { results?: LookupTrack[] };
        for (const track of data.results ?? []) {
          if (track.trackId) out.set(String(track.trackId), track);
        }
      } catch {
        // ignore lookup errors for individual chunks
      }
    }),
  );

  return out;
}
