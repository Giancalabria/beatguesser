import { getAllSongs } from './catalog';
import type { Song } from '../types';

const STOP_WORDS = new Set(['the', 'el', 'la', 'los', 'las', 'a', 'an']);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

function similarity(query: string, song: Song): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;

  const title = normalize(song.title);
  const artist = normalize(song.artist);
  const haystack = `${title} ${artist}`.trim();
  const songTokens = tokenize(`${song.title} ${song.artist}`);

  let matches = 0;
  for (const qt of qTokens) {
    if (haystack.includes(qt)) {
      matches++;
      continue;
    }
    for (const st of songTokens) {
      if (st.startsWith(qt) || qt.startsWith(st)) {
        matches += 0.8;
        break;
      }
    }
  }

  const coverage = matches / qTokens.length;
  const fullNorm = normalize(query);
  const titleBonus =
    title === fullNorm
      ? 2
      : title.startsWith(`${fullNorm} `)
        ? 1.25
        : title.includes(fullNorm)
          ? 0.75
          : 0;
  const labelBonus = haystack === fullNorm ? 1 : haystack.startsWith(fullNorm) ? 0.5 : 0;
  const artistBonus = artist === fullNorm ? 0.5 : 0;

  return coverage + titleBonus + labelBonus + artistBonus;
}

export function searchSongs(query: string, songs: Song[] = getAllSongs(), limit = 8): Song[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  return songs
    .map((song) => ({ song, score: similarity(trimmed, song) }))
    .filter(({ score }) => score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ song }) => song);
}

export function matchSong(query: string, songs: Song[] = getAllSongs()): Song | null {
  const results = searchSongs(query, songs, 1);
  if (results.length === 0) return null;

  const trimmed = query.trim();
  const top = results[0];
  const score = similarity(trimmed, top);
  return score >= 0.6 ? top : null;
}

function titleWithoutVersion(title: string): string {
  return title
    .replace(
      /\s*[\[(](?:feat(?:uring)?|ft\.?|with|remaster(?:ed)?|radio edit|live|version|edit|mix)[^\])]*[\])]\s*$/i,
      '',
    )
    .replace(
      /\s*-\s*(?:remaster(?:ed)?|radio edit|live|album version|single version|edit|mix)\b.*$/i,
      '',
    )
    .trim();
}

export function isCorrectGuess(
  query: string,
  target: Song,
  selectedSong?: Song,
): boolean {
  if (selectedSong) {
    if (selectedSong.spotifyId && target.spotifyId) {
      if (selectedSong.spotifyId === target.spotifyId) return true;
    }
    if (selectedSong.id === target.id) return true;
    return equivalentSong(selectedSong, target);
  }

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return false;

  const baseTitle = titleWithoutVersion(target.title);
  const accepted = new Set([
    normalize(target.title),
    normalize(`${target.title} ${target.artist}`),
    normalize(`${target.artist} ${target.title}`),
    normalize(baseTitle),
    normalize(`${baseTitle} ${target.artist}`),
  ]);

  return accepted.has(normalizedQuery);
}

function primaryArtist(artist: string): string {
  return normalize(artist.split(/,|&|\bfeat(?:uring)?\.?\b|\bft\.?\b/i)[0]);
}

function equivalentSong(first: Song, second: Song): boolean {
  const firstTitle = normalize(titleWithoutVersion(first.title));
  const secondTitle = normalize(titleWithoutVersion(second.title));
  if (!firstTitle || firstTitle !== secondTitle) return false;

  const firstArtist = primaryArtist(first.artist);
  const secondArtist = primaryArtist(second.artist);
  return Boolean(
    firstArtist &&
      secondArtist &&
      (firstArtist === secondArtist ||
        firstArtist.includes(secondArtist) ||
        secondArtist.includes(firstArtist)),
  );
}

export { similarity };
