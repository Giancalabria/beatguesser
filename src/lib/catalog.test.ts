import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    functions: { invoke },
  }),
}));

import { getBackupSongs, getSongsByPool, resolveSongPreview, searchSpotifyCatalog, spotifyUrlForSong, upgradeItunesArtwork } from './catalog';

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

  it('provides deterministic backup songs from the same pool', () => {
    const primary = {
      id: 'remote-song',
      title: 'Remote Song',
      artist: 'Remote Artist',
      pool: 'hard' as const,
      lang: 'en' as const,
      itunesSearchTerm: 'Remote Song Remote Artist',
    };

    const first = getBackupSongs(primary);
    const second = getBackupSongs(primary);

    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first.every((song) => song.pool === primary.pool)).toBe(true);
    expect(first.some((song) => song.id === primary.id)).toBe(false);
  });

  it('never repeats a local primary as its own backup', () => {
    const primary = getBackupSongs({
      id: 'remote-song',
      title: 'Remote Song',
      artist: 'Remote Artist',
      pool: 'easy',
      itunesSearchTerm: 'Remote Song Remote Artist',
    })[0];

    const backups = getBackupSongs(primary);
    expect(backups).toHaveLength(4);
    expect(backups.some((song) => song.id === primary.id)).toBe(false);
  });

  it('uses globally recognizable hits in every pool, including expert and impossible', () => {
    expect(getSongsByPool('easy').map((song) => song.title)).toEqual(
      expect.arrayContaining(['Blinding Lights', 'Shape of You', 'Cruel Summer']),
    );
    expect(getSongsByPool('medium').map((song) => song.title)).toEqual(
      expect.arrayContaining(['Hawái', 'Levitating']),
    );
    expect(getSongsByPool('expert').map((song) => song.title)).toEqual(
      expect.arrayContaining(['Viva La Vida', 'Poker Face', 'Seven Nation Army']),
    );
    expect(getSongsByPool('impossible').map((song) => song.title)).toEqual(
      expect.arrayContaining(['The Scientist', 'Take Me to Church', 'Pumped Up Kicks']),
    );
    expect(getSongsByPool('easy', 'es').map((song) => song.title)).toEqual(
      expect.arrayContaining(['Despacito', 'Titi Me Preguntó']),
    );
    expect(getSongsByPool('easy', 'en').every((song) => song.lang === 'en')).toBe(true);
  });
});

describe('song reveal links', () => {
  it('upgrades iTunes artwork to a larger square', () => {
    expect(
      upgradeItunesArtwork(
        'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ab/cd/ef/100x100bb.jpg',
      ),
    ).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ab/cd/ef/600x600bb.jpg');
  });

  it('links to the Spotify track when an id is available', () => {
    expect(
      spotifyUrlForSong({
        spotifyId: 'abc123',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
      }),
    ).toBe('https://open.spotify.com/track/abc123');
  });

  it('falls back to a Spotify search when the track id is missing', () => {
    expect(
      spotifyUrlForSong({
        title: 'Blinding Lights',
        artist: 'The Weeknd',
      }),
    ).toBe('https://open.spotify.com/search/Blinding%20Lights%20The%20Weeknd');
  });
});
