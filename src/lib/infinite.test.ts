import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: () => null,
}));

import { pickRandomSong } from './infinite';

describe('infinite seed fallback', () => {
  it('does not reset the used set when the pool is exhausted', async () => {
    const used = new Set<string>();
    const seen = new Set<string>();

    for (let i = 0; i < 5; i += 1) {
      const song = await pickRandomSong('easy', 'en', used);
      expect(song).not.toBeNull();
      if (!song) return;
      expect(used.has(song.id)).toBe(false);
      used.add(song.id);
      seen.add(song.id);
    }

    expect(seen.size).toBe(5);
    const usedList = [...used];
    const lastId = usedList[usedList.length - 1];
    const recycled = await pickRandomSong('easy', 'en', used, lastId);
    expect(recycled).not.toBeNull();
    expect(used.size).toBe(5);
    expect(recycled && used.has(recycled.id)).toBe(true);
    expect(recycled?.id).not.toBe(lastId);
  });
});
