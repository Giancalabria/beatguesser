import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    functions: { invoke },
  }),
}));

import { resolveSongPreview, searchSpotifyCatalog } from './catalog';

describe('searchSpotifyCatalog', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('maps Spotify Edge Function results into suggestions', async () => {
    invoke.mockResolvedValue({
      data: {
        results: [
          {
            spotifyId: 'track-123',
            title: 'Blinding Lights',
            artist: 'The Weeknd',
          },
        ],
      },
      error: null,
    });

    await expect(searchSpotifyCatalog('Blinding', 'easy')).resolves.toEqual([
      {
        id: 'spotify:track-123',
        spotifyId: 'track-123',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        pool: 'easy',
        itunesSearchTerm: 'Blinding Lights The Weeknd',
      },
    ]);
    expect(invoke).toHaveBeenCalledWith('search-songs', {
      body: { q: 'Blinding', market: 'AR', limit: 10 },
    });
  });

  it('returns the local fallback path when remote search fails', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('unavailable'),
    });

    await expect(searchSpotifyCatalog('unavailable-query', 'hard')).resolves.toEqual([]);
  });

  it('does not call the API before two characters', async () => {
    await expect(searchSpotifyCatalog('a', 'easy')).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refreshes temporary Deezer previews through the Edge Function', async () => {
    invoke.mockResolvedValue({
      data: {
        previewUrl: 'https://audio-ssl.itunes.apple.com/fresh-preview.m4a',
      },
      error: null,
    });

    await expect(
      resolveSongPreview({
        id: '123e4567-e89b-42d3-a456-426614174000',
        title: 'Girl',
        artist: 'Myke Towers',
        pool: 'easy',
        itunesSearchTerm: 'Girl Myke Towers',
        previewUrl:
          'https://cdnt-preview.dzcdn.net/api/1/preview.mp3?hdnea=exp=1~acl=/*',
      }),
    ).resolves.toMatchObject({
      previewUrl: 'https://audio-ssl.itunes.apple.com/fresh-preview.m4a',
    });

    expect(invoke).toHaveBeenCalledWith('resolve-preview', {
      body: { songId: '123e4567-e89b-42d3-a456-426614174000' },
    });
  });
});
