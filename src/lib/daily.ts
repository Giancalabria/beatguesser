import { getSongsByPool } from './catalog';
import { getSupabase } from './supabase';
import type { Pool, Song } from '../types';

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

export function pickDailySong(dateKey: string, pool: Pool): Song {
  const songs = getSongsByPool(pool);
  if (songs.length === 0) {
    throw new Error(`No songs for pool: ${pool}`);
  }
  const index = hashString(`${dateKey}:${pool}`) % songs.length;
  return { ...songs[index] };
}

interface DailyPickRow {
  song_id: string;
  songs:
    | {
        id: string;
        spotify_id: string | null;
        title: string;
        artist: string;
        pool: Pool;
        preview_url: string | null;
      }
    | {
        id: string;
        spotify_id: string | null;
        title: string;
        artist: string;
        pool: Pool;
        preview_url: string | null;
      }[]
    | null;
}

function songFromPick(row: DailyPickRow): Song | null {
  const raw = row.songs;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  return {
    id: s.id,
    spotifyId: s.spotify_id ?? undefined,
    title: s.title,
    artist: s.artist,
    pool: s.pool,
    itunesSearchTerm: `${s.title} ${s.artist}`,
    previewUrl: s.preview_url ?? undefined,
  };
}

/** Shared daily from Supabase (pre-picked). Falls back to local catalog hash. */
export async function resolveDailySong(pool: Pool, dateKey: string = getDateKey()): Promise<Song> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('daily_picks')
      .select('song_id, songs (id, spotify_id, title, artist, pool, preview_url)')
      .eq('date', dateKey)
      .eq('pool', pool)
      .maybeSingle();

    if (!error && data) {
      const song = songFromPick(data as DailyPickRow);
      if (song) return song;
    }
    if (error) {
      logDailyDev('Supabase pick unavailable; using deterministic fallback', pool, dateKey, error);
    } else {
      logDailyDev('Daily pick missing; using deterministic fallback', pool, dateKey);
    }
  }

  return pickDailySong(dateKey, pool);
}
