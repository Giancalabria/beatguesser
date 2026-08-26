import { getSongsByPool } from './catalog';
import { getSupabase } from './supabase';
import type { LangMode, Pool, Song } from '../types';

const TIMEZONE = 'America/Argentina/Buenos_Aires';

function logDailyDev(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn('[daily]', ...args);
  }
}

export function getDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickDailySong(dateKey: string, pool: Pool, lang: LangMode = 'global'): Song {
  const songs = getSongsByPool(pool, lang);
  if (songs.length === 0) {
    throw new Error(`No songs for pool: ${pool} (${lang})`);
  }
  const index = hashString(`${dateKey}:${lang}:${pool}`) % songs.length;
  return { ...songs[index] };
}

interface DailyPickRow {
  song_id: string;
  songs:
    | {
        id: string;
        spotify_id: string | null;
        apple_id?: string | null;
        title: string;
        artist: string;
        preview_url: string | null;
        artwork_url?: string | null;
      }
    | {
        id: string;
        spotify_id: string | null;
        apple_id?: string | null;
        title: string;
        artist: string;
        preview_url: string | null;
        artwork_url?: string | null;
      }[]
    | null;
}

function songFromPick(row: DailyPickRow, pool: Pool, lang: LangMode): Song | null {
  const raw = row.songs;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  return {
    id: s.id,
    spotifyId: s.spotify_id ?? undefined,
    appleId: s.apple_id ?? undefined,
    title: s.title,
    artist: s.artist,
    pool,
    lang,
    itunesSearchTerm: `${s.title} ${s.artist}`,
    previewUrl: s.preview_url ?? undefined,
    imageUrl: s.artwork_url ?? undefined,
  };
}

/** Shared daily from Supabase (pre-picked). Falls back to local catalog hash. */
export async function resolveDailySong(
  pool: Pool,
  lang: LangMode = 'global',
  dateKey: string = getDateKey(),
): Promise<Song> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('daily_picks')
      .select('song_id, songs (id, spotify_id, apple_id, title, artist, preview_url, artwork_url)')
      .eq('date', dateKey)
      .eq('lang', lang)
      .eq('pool', pool)
      .maybeSingle();

    if (!error && data) {
      const song = songFromPick(data as DailyPickRow, pool, lang);
      if (song) return song;
    }
    if (error) {
      logDailyDev('Supabase pick unavailable; using deterministic fallback', pool, lang, dateKey, error);
    } else {
      logDailyDev('Daily pick missing; using deterministic fallback', pool, lang, dateKey);
    }
  }

  return pickDailySong(dateKey, pool, lang);
}
