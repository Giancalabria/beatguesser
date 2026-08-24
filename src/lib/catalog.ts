import type { Song, Pool } from '../types';
import { getSupabase } from './supabase';

const SEED_SONGS: Omit<Song, 'previewUrl'>[] = [
  // Easy — mainstream hits
  { id: 'e1', title: 'Blinding Lights', artist: 'The Weeknd', pool: 'easy', itunesSearchTerm: 'Blinding Lights The Weeknd' },
  { id: 'e2', title: 'As It Was', artist: 'Harry Styles', pool: 'easy', itunesSearchTerm: 'As It Was Harry Styles' },
  { id: 'e3', title: 'Cruel Summer', artist: 'Taylor Swift', pool: 'easy', itunesSearchTerm: 'Cruel Summer Taylor Swift' },
  { id: 'e4', title: 'BZRP Music Sessions #53', artist: 'Shakira', pool: 'easy', itunesSearchTerm: 'Shakira BZRP Music Sessions' },
  { id: 'e5', title: 'BZRP Music Sessions #52', artist: 'Quevedo', pool: 'easy', itunesSearchTerm: 'Quevedo BZRP Music Sessions' },

  // Medium — well known but not omnipresent
  { id: 'm1', title: 'Espresso', artist: 'Sabrina Carpenter', pool: 'medium', itunesSearchTerm: 'Espresso Sabrina Carpenter' },
  { id: 'm2', title: 'Flowers', artist: 'Miley Cyrus', pool: 'medium', itunesSearchTerm: 'Flowers Miley Cyrus' },
  { id: 'm3', title: 'Die With A Smile', artist: 'Lady Gaga', pool: 'medium', itunesSearchTerm: 'Die With A Smile Lady Gaga Bruno Mars' },
  { id: 'm4', title: 'La Bachata', artist: 'Manuel Turizo', pool: 'medium', itunesSearchTerm: 'La Bachata Manuel Turizo' },
  { id: 'm5', title: 'Monaco', artist: 'Bad Bunny', pool: 'medium', itunesSearchTerm: 'Monaco Bad Bunny' },

  // Hard — deeper cuts / older
  { id: 'h1', title: 'Redbone', artist: 'Childish Gambino', pool: 'hard', itunesSearchTerm: 'Redbone Childish Gambino' },
  { id: 'h2', title: 'Take On Me', artist: 'a-ha', pool: 'hard', itunesSearchTerm: 'Take On Me a-ha' },
  { id: 'h3', title: 'Dreams', artist: 'Fleetwood Mac', pool: 'hard', itunesSearchTerm: 'Dreams Fleetwood Mac' },
  { id: 'h4', title: 'Riptide', artist: 'Vance Joy', pool: 'hard', itunesSearchTerm: 'Riptide Vance Joy' },
  { id: 'h5', title: 'Pompeii', artist: 'Bastille', pool: 'hard', itunesSearchTerm: 'Pompeii Bastille' },

  // Expert — less radio, still on iTunes
  { id: 'x1', title: 'Midnight City', artist: 'M83', pool: 'expert', itunesSearchTerm: 'Midnight City M83' },
  { id: 'x2', title: 'Electric Feel', artist: 'MGMT', pool: 'expert', itunesSearchTerm: 'Electric Feel MGMT' },
  { id: 'x3', title: 'Dog Days Are Over', artist: 'Florence + The Machine', pool: 'expert', itunesSearchTerm: 'Dog Days Are Over Florence' },
  { id: 'x4', title: '1901', artist: 'Phoenix', pool: 'expert', itunesSearchTerm: '1901 Phoenix' },
  { id: 'x5', title: 'Kids', artist: 'MGMT', pool: 'expert', itunesSearchTerm: 'Kids MGMT' },

  // Impossible — obscure / deep catalog
  { id: 'i1', title: 'Heartbeats', artist: 'José González', pool: 'impossible', itunesSearchTerm: 'Heartbeats Jose Gonzalez' },
  { id: 'i2', title: 'Holocene', artist: 'Bon Iver', pool: 'impossible', itunesSearchTerm: 'Holocene Bon Iver' },
  { id: 'i3', title: 'Breathe Me', artist: 'Sia', pool: 'impossible', itunesSearchTerm: 'Breathe Me Sia' },
  { id: 'i4', title: 'Such Great Heights', artist: 'The Postal Service', pool: 'impossible', itunesSearchTerm: 'Such Great Heights Postal Service' },
  { id: 'i5', title: 'Young Folks', artist: 'Peter Bjorn and John', pool: 'impossible', itunesSearchTerm: 'Young Folks Peter Bjorn and John' },
];

const previewCache = new Map<string, string>();
const searchCatalogCache = new Map<Pool, Song[]>();
const spotifySearchCache = new Map<
  string,
  { expiresAt: number; songs: Song[] }
>();

interface ITunesResult {
  results?: Array<{
    previewUrl?: string;
    trackName?: string;
    artistName?: string;
  }>;
}

function logDev(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.debug('[preview]', ...args);
  }
}

function normalizeMediaLabel(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesExpectedITunesResult(
  result: NonNullable<ITunesResult['results']>[number],
  expectedTitle: string,
  expectedArtist: string,
): boolean {
  const actualTitle = normalizeMediaLabel(result.trackName ?? '');
  const targetTitle = normalizeMediaLabel(expectedTitle);
  const actualArtist = normalizeMediaLabel(result.artistName ?? '');
  const targetArtist = normalizeMediaLabel(expectedArtist.split(/,|&|\bfeat\.?\b/i)[0]);
  const titleMatches =
    actualTitle.length > 0 &&
    (actualTitle === targetTitle ||
      actualTitle.includes(targetTitle) ||
      targetTitle.includes(actualTitle));
  return Boolean(titleMatches && targetArtist && actualArtist.includes(targetArtist));
}

async function fetchPreviewFromITunes(
  term: string,
  expectedTitle: string,
  expectedArtist: string,
): Promise<string | undefined> {
  const cached = previewCache.get(term);
  if (cached) return cached;

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`;
    const res = await fetch(url);
    if (!res.ok) {
      logDev('iTunes search failed', term, res.status);
      return undefined;
    }

    const data = (await res.json()) as ITunesResult;
    const matched = data.results?.find(
      (result) =>
        result.previewUrl &&
        matchesExpectedITunesResult(result, expectedTitle, expectedArtist),
    );
    const previewUrl = matched?.previewUrl;
    if (previewUrl) {
      previewCache.set(term, previewUrl);
      logDev('iTunes preview resolved', term);
      return previewUrl;
    }
    logDev('iTunes search empty', term);
  } catch (err) {
    logDev('iTunes unavailable', term, err);
  }
  return undefined;
}

/** Probe that a preview URL can start loading in this browser. */
export async function probePreviewUrl(url: string, timeoutMs = 8_000): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onReady = () => finish(true);
    const onError = () => finish(false);
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
      audio.src = '';
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    audio.preload = 'metadata';
    audio.addEventListener('canplay', onReady, { once: true });
    audio.addEventListener('loadeddata', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    audio.src = url;
    audio.load();
  });
}

function itunesTermFor(song: Song): string {
  return song.itunesSearchTerm || `${song.title} ${song.artist}`;
}

export function getSeedCatalog(): Song[] {
  return SEED_SONGS.map((s) => ({ ...s }));
}

export function getSongsByPool(pool: Pool): Song[] {
  return SEED_SONGS.filter((s) => s.pool === pool).map((s) => ({ ...s }));
}

interface SongRow {
  id: string;
  spotify_id: string | null;
  title: string;
  artist: string;
  pool: Pool;
  preview_url: string | null;
}

function songFromRow(row: SongRow): Song {
  return {
    id: row.id,
    spotifyId: row.spotify_id ?? undefined,
    title: row.title,
    artist: row.artist,
    pool: row.pool,
    itunesSearchTerm: `${row.title} ${row.artist}`,
    previewUrl: row.preview_url ?? undefined,
  };
}

/**
 * Songs available to the autocomplete. Supabase's `songs` table is the
 * history of Spotify daily picks, while the seed catalog remains the fallback.
 */
export async function getSearchCatalog(pool: Pool): Promise<Song[]> {
  const cached = searchCatalogCache.get(pool);
  if (cached) return cached.map((song) => ({ ...song }));

  const fallback = getSongsByPool(pool);
  const supabase = getSupabase();
  if (!supabase) {
    searchCatalogCache.set(pool, fallback);
    return fallback.map((song) => ({ ...song }));
  }

  const remote: Song[] = [];
  const pageSize = 1_000;
  let from = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('songs')
        .select('id, spotify_id, title, artist, pool, preview_url')
        .eq('pool', pool)
        .range(from, from + pageSize - 1);

      if (error) throw error;
      const rows = (data ?? []) as SongRow[];
      remote.push(...rows.map(songFromRow));
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  } catch (error) {
    logDev('search catalog unavailable', pool, error);
  }

  const byLabel = new Map<string, Song>();
  for (const song of [...remote, ...fallback]) {
    const key = `${song.title}::${song.artist}`.toLocaleLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, song);
  }
  const catalog = [...byLabel.values()];
  searchCatalogCache.set(pool, catalog);
  return catalog.map((song) => ({ ...song }));
}

interface SpotifySearchResponse {
  results?: Array<{
    spotifyId?: unknown;
    title?: unknown;
    artist?: unknown;
  }>;
}

/**
 * Full-catalog autocomplete powered by Spotify through a Supabase Edge
 * Function. The browser never receives Spotify credentials.
 */
export async function searchSpotifyCatalog(
  query: string,
  pool: Pool,
  limit = 10,
): Promise<Song[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const cacheKey = `${pool}:${normalizedQuery.toLocaleLowerCase()}`;
  const cached = spotifySearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.songs.map((song) => ({ ...song }));
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.functions.invoke<SpotifySearchResponse>(
      'search-songs',
      {
        body: {
          q: normalizedQuery,
          market: 'AR',
          limit: Math.min(12, Math.max(1, limit)),
        },
      },
    );
    if (error) throw error;

    const songs = (data?.results ?? [])
      .filter(
        (result): result is { spotifyId: string; title: string; artist: string } =>
          typeof result.spotifyId === 'string' &&
          typeof result.title === 'string' &&
          typeof result.artist === 'string',
      )
      .map((result) => ({
        id: `spotify:${result.spotifyId}`,
        spotifyId: result.spotifyId,
        title: result.title,
        artist: result.artist,
        pool,
        itunesSearchTerm: `${result.title} ${result.artist}`,
      }));

    spotifySearchCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      songs,
    });
    return songs.map((song) => ({ ...song }));
  } catch (error) {
    logDev('Spotify autocomplete unavailable', normalizedQuery, error);
    return [];
  }
}

/**
 * Resolve a playable preview URL.
 * If a persisted URL exists but fails to load, fall back to iTunes search.
 */
export async function resolveSongPreview(song: Song): Promise<Song> {
  const term = itunesTermFor(song);

  if (song.previewUrl) {
    const ok = await probePreviewUrl(song.previewUrl);
    if (ok) {
      return song;
    }
    logDev('stored preview broken, trying iTunes', song.id, song.previewUrl);
  }

  const previewUrl = await fetchPreviewFromITunes(term, song.title, song.artist);
  return { ...song, previewUrl };
}

export async function resolveCatalogPreviews(songs: Song[]): Promise<Song[]> {
  return Promise.all(songs.map(resolveSongPreview));
}

export function getAllSongs(): Song[] {
  return getSeedCatalog();
}

export function getSongById(id: string): Song | undefined {
  const found = SEED_SONGS.find((s) => s.id === id);
  return found ? { ...found } : undefined;
}
