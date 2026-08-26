import { getSongsByPool } from './catalog';
import { getSupabase } from './supabase';
import type { LangMode, Pool, Song } from '../types';

interface PoolSongRow {
  id: string;
  apple_id: string | null;
  spotify_id: string | null;
  title: string;
  artist: string;
  pool: Pool;
  preview_url: string | null;
  artwork_url: string | null;
}

function songFromRpc(row: PoolSongRow, lang: LangMode): Song {
  return {
    id: row.id,
    appleId: row.apple_id ?? undefined,
    spotifyId: row.spotify_id ?? undefined,
    title: row.title,
    artist: row.artist,
    pool: row.pool,
    lang,
    itunesSearchTerm: `${row.title} ${row.artist}`,
    previewUrl: row.preview_url ?? undefined,
    imageUrl: row.artwork_url ?? undefined,
  };
}

function unwrapRpc(data: unknown): PoolSongRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const value = row as Partial<PoolSongRow>;
  if (!value.id || !value.title || !value.artist || !value.pool) return null;
  return {
    id: value.id,
    apple_id: value.apple_id ?? null,
    spotify_id: value.spotify_id ?? null,
    title: value.title,
    artist: value.artist,
    pool: value.pool,
    preview_url: value.preview_url ?? null,
    artwork_url: value.artwork_url ?? null,
  };
}

function pickFromSeed(pool: Pool, lang: LangMode, usedIds: Set<string>, lastId?: string): Song | null {
  const available = getSongsByPool(pool, lang).filter((s) => !usedIds.has(s.id));
  if (available.length > 0) {
    return { ...available[Math.floor(Math.random() * available.length)] };
  }
  const recycle = getSongsByPool(pool, lang).filter((s) => s.id !== lastId);
  if (recycle.length === 0) {
    const all = getSongsByPool(pool, lang);
    return all.length > 0 ? { ...all[0] } : null;
  }
  return { ...recycle[Math.floor(Math.random() * recycle.length)] };
}

export async function pickRandomSong(
  pool: Pool,
  lang: LangMode,
  usedIds: Set<string>,
  lastId?: string,
): Promise<Song | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const exclude = [...usedIds];
      const fresh = await supabase.rpc('pick_pool_song', {
        p_lang: lang,
        p_pool: pool,
        p_exclude: exclude,
      });
      const picked = unwrapRpc(fresh.data);
      if (picked) return songFromRpc(picked, lang);

      const recycled = await supabase.rpc('pick_pool_song_recycle', {
        p_lang: lang,
        p_pool: pool,
        p_exclude: lastId ? [lastId] : [],
      });
      const again = unwrapRpc(recycled.data);
      if (again) return songFromRpc(again, lang);
    } catch {
      // fall through to the local seed
    }
  }

  return pickFromSeed(pool, lang, usedIds, lastId);
}
