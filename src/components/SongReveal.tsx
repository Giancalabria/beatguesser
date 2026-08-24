import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveSongArtwork, spotifyUrlForSong } from '../lib/catalog';

interface SongRevealProps {
  title: string;
  artist: string;
  imageUrl?: string;
  spotifyId?: string;
  caption?: string;
  size?: 'sm' | 'md';
}

function SpotifyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.18c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.96-.18-1.08-.66-.12-.48.18-.96.66-1.08 4.38-1.32 9.78-.66 13.5 1.62.42.24.54.84.12 1.2zm.12-3.3C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.48-1.02.66-1.56.36z" />
    </svg>
  );
}

export default function SongReveal({
  title,
  artist,
  imageUrl,
  spotifyId,
  caption,
  size = 'md',
}: SongRevealProps) {
  const { t } = useTranslation();
  const [cover, setCover] = useState(imageUrl);
  const href = spotifyUrlForSong({ title, artist, spotifyId });
  const coverClass = size === 'sm' ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-32 w-32 sm:h-40 sm:w-40';

  useEffect(() => {
    if (imageUrl) {
      setCover(imageUrl);
      return;
    }
    let cancelled = false;
    void resolveSongArtwork(title, artist).then((url) => {
      if (!cancelled && url) setCover(url);
    });
    return () => {
      cancelled = true;
    };
  }, [artist, imageUrl, title]);

  return (
    <div className="flex flex-col items-center text-center gap-2">
      {caption && (
        <p className="text-neutral-500 text-xs sm:text-sm uppercase tracking-wider">
          {caption}
        </p>
      )}
      {cover ? (
        <img
          src={cover}
          alt=""
          className={`${coverClass} rounded-xl object-cover shadow-lg bg-white/5`}
        />
      ) : (
        <div
          className={`${coverClass} rounded-xl bg-white/5`}
          aria-hidden="true"
        />
      )}
      <p className="text-lg sm:text-xl font-semibold text-white leading-tight">{title}</p>
      <p className="text-neutral-400 text-sm sm:text-base">{artist}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-[#1DB954] px-4 text-sm font-semibold text-black hover:bg-[#1ed760] transition-colors"
      >
        <SpotifyIcon />
        {t('game.listenOnSpotify')}
      </a>
    </div>
  );
}
