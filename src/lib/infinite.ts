import { getSongsByPool } from './catalog';
import type { Pool, Song } from '../types';

export function pickRandomSong(pool: Pool, usedIds: Set<string>): Song | null {
  const available = getSongsByPool(pool).filter((s) => !usedIds.has(s.id));
  if (available.length === 0) return null;

  const index = Math.floor(Math.random() * available.length);
  return { ...available[index] };
}

export function createUsedSet(): Set<string> {
  return new Set<string>();
}
