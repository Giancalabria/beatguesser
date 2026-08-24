-- Spotify Search does not treat "year:2024 OR year:2025" as a boolean OR.
-- Use inclusive year ranges instead.
UPDATE public.pick_rules SET spotify_query = q FROM (VALUES
  ('easy',       'year:2023-2026'),
  ('medium',     'year:2014-2020'),
  ('hard',       'year:2006-2012'),
  ('expert',     'year:1996-2005'),
  ('impossible', 'year:1985-1995')
) AS v(pool, q)
WHERE public.pick_rules.pool = v.pool;
