import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { isCorrectGuess, normalize, searchSongs } from './search';

const spotifySong: Song = {
  id: '8f89a9e4-spotify-uuid',
  spotifyId: 'spotify-track-123',
  title: 'Canción del Año (Remastered 2026)',
  artist: 'José González',
  pool: 'hard',
  itunesSearchTerm: 'Canción del Año José González',
};

describe('normalize', () => {
  it('normalizes accents, punctuation and whitespace', () => {
    expect(normalize('  Canción #1 — José  ')).toBe('cancion 1 jose');
  });
});

describe('isCorrectGuess', () => {
  it('accepts an exact title from a dynamic Supabase song', () => {
    expect(isCorrectGuess('Canción del Año (Remastered 2026)', spotifySong)).toBe(true);
  });

  it('accepts title without a common version suffix', () => {
    expect(isCorrectGuess('Cancion del Año', spotifySong)).toBe(true);
  });

  it('accepts title plus artist regardless of punctuation and accents', () => {
    expect(isCorrectGuess('Cancion del Ano - Jose Gonzalez', spotifySong)).toBe(true);
  });

  it('accepts a Spotify suggestion when its provider id matches', () => {
    const suggestion = {
      ...spotifySong,
      id: 'spotify:spotify-track-123',
    };
    expect(isCorrectGuess('anything', spotifySong, suggestion)).toBe(true);
  });

  it('accepts equivalent releases with different Spotify ids', () => {
    const suggestion = {
      ...spotifySong,
      id: 'spotify:different-track',
      spotifyId: 'different-track',
    };
    expect(
      isCorrectGuess('the input text is ignored', spotifySong, suggestion),
    ).toBe(true);
  });

  it('rejects a same-title selection from a different artist', () => {
    expect(
      isCorrectGuess(spotifySong.title, spotifySong, {
        ...spotifySong,
        id: 'spotify:different-artist-track',
        spotifyId: 'different-artist-track',
        artist: 'Another Artist',
      }),
    ).toBe(false);
  });

  it('still accepts local suggestions by their catalog id', () => {
    const localSong = { ...spotifySong, id: 'local-1', spotifyId: undefined };
    expect(isCorrectGuess('anything', localSong, localSong)).toBe(true);
  });

  it('rejects partial and unrelated guesses', () => {
    expect(isCorrectGuess('Canción', spotifySong)).toBe(false);
    expect(isCorrectGuess('Otra canción', spotifySong)).toBe(false);
  });

  it('does not accept a close typo as a typed answer', () => {
    const blindingLights = {
      ...spotifySong,
      id: 'blinding-lights',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
    };

    expect(isCorrectGuess('Binding Lights', blindingLights)).toBe(false);
  });
});

describe('searchSongs', () => {
  it('searches the supplied dynamic catalog', () => {
    expect(searchSongs('Jose Gonzalez', [spotifySong], 6)).toEqual([spotifySong]);
  });

  it('ranks an exact title ahead of partial title matches', () => {
    const partial = {
      ...spotifySong,
      id: 'partial',
      title: 'The Canción del Año Remix Collection',
    };

    expect(searchSongs('Canción del Año', [partial, spotifySong], 6)).toEqual([
      spotifySong,
      partial,
    ]);
  });

});
