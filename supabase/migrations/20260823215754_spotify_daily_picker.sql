-- Songs become a cache of Spotify picks, not a hand-seeded catalog.
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS spotify_id text;

CREATE UNIQUE INDEX IF NOT EXISTS songs_spotify_id_key
  ON public.songs (spotify_id);

ALTER TABLE public.pick_rules
  ADD COLUMN IF NOT EXISTS spotify_query text;

UPDATE public.pick_rules SET spotify_query = q FROM (VALUES
  ('easy',       'year:2024 OR year:2025 OR year:2026'),
  ('medium',     'year:2016 OR year:2018 OR year:2020'),
  ('hard',       'year:2008 OR year:2010 OR year:2012'),
  ('expert',     'year:1998 OR year:2002 OR year:2005'),
  ('impossible', 'year:1988 OR year:1992 OR year:1994')
) AS v(pool, q)
WHERE public.pick_rules.pool = v.pool;

COMMENT ON COLUMN public.pick_rules.spotify_query IS 'Spotify Search q used by the pick-daily Edge Function';

-- Stop picking from an empty local catalog. The Edge Function does Spotify search.
DO $$
BEGIN
  PERFORM cron.unschedule('beatguesser-rotate-daily');
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
