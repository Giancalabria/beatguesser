import type { Song, Pool } from '../types';

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

interface ITunesResult {
  results?: Array<{ previewUrl?: string }>;
}

async function fetchPreviewFromITunes(term: string): Promise<string | undefined> {
  const cached = previewCache.get(term);
  if (cached) return cached;

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return undefined;

    const data = (await res.json()) as ITunesResult;
    const previewUrl = data.results?.[0]?.previewUrl;
    if (previewUrl) {
      previewCache.set(term, previewUrl);
      return previewUrl;
    }
  } catch {
    // iTunes unavailable — song plays without preview
  }
  return undefined;
}

export function getSeedCatalog(): Song[] {
  return SEED_SONGS.map((s) => ({ ...s }));
}

export function getSongsByPool(pool: Pool): Song[] {
  return SEED_SONGS.filter((s) => s.pool === pool).map((s) => ({ ...s }));
}

export async function resolveSongPreview(song: Song): Promise<Song> {
  if (song.previewUrl) return song;
  const previewUrl = await fetchPreviewFromITunes(song.itunesSearchTerm);
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
