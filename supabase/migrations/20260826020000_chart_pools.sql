-- Chart-based boards: language is a dimension, difficulty is rank band.
-- Existing daily_picks and pick_rules stay on lang = 'global'.

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS apple_id text,
  ADD COLUMN IF NOT EXISTS artwork_url text,
  ADD COLUMN IF NOT EXISTS explicit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_ms int,
  ADD COLUMN IF NOT EXISTS lang_override text;

ALTER TABLE public.songs
  DROP CONSTRAINT IF EXISTS songs_lang_override_check;
ALTER TABLE public.songs
  ADD CONSTRAINT songs_lang_override_check
  CHECK (lang_override IS NULL OR lang_override IN ('global', 'es', 'en'));

ALTER TABLE public.songs
  ALTER COLUMN pool DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS songs_apple_id_key
  ON public.songs (apple_id);

ALTER TABLE public.daily_picks
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'global';

ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS daily_picks_lang_check;
ALTER TABLE public.daily_picks
  ADD CONSTRAINT daily_picks_lang_check
  CHECK (lang IN ('global', 'es', 'en'));

ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS daily_picks_pkey;
ALTER TABLE public.daily_picks
  ADD PRIMARY KEY (date, lang, pool);

ALTER TABLE public.pick_rules
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'global';

ALTER TABLE public.pick_rules
  DROP CONSTRAINT IF EXISTS pick_rules_lang_check;
ALTER TABLE public.pick_rules
  ADD CONSTRAINT pick_rules_lang_check
  CHECK (lang IN ('global', 'es', 'en'));

ALTER TABLE public.pick_rules
  DROP CONSTRAINT IF EXISTS pick_rules_pkey;
ALTER TABLE public.pick_rules
  ADD PRIMARY KEY (lang, pool);

INSERT INTO public.pick_rules (
  lang, pool, min_popularity, max_popularity, cooldown_days, require_preview, spotify_query
)
SELECT v.lang, r.pool, r.min_popularity, r.max_popularity, r.cooldown_days, r.require_preview, r.spotify_query
FROM public.pick_rules r
CROSS JOIN (VALUES ('es'), ('en')) AS v(lang)
WHERE r.lang = 'global'
ON CONFLICT (lang, pool) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.chart_entries (
  market text NOT NULL,
  apple_id text NOT NULL,
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 100),
  captured_on date NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  genre_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (market, apple_id, captured_on)
);

CREATE INDEX IF NOT EXISTS chart_entries_apple_id_idx
  ON public.chart_entries (apple_id, captured_on DESC);

CREATE TABLE IF NOT EXISTS public.pool_songs (
  lang text NOT NULL CHECK (lang IN ('global', 'es', 'en')),
  song_id uuid NOT NULL REFERENCES public.songs (id) ON DELETE CASCADE,
  pool text NOT NULL CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  best_rank int NOT NULL CHECK (best_rank BETWEEN 1 AND 100),
  chart_days int NOT NULL DEFAULT 1,
  last_seen date NOT NULL,
  PRIMARY KEY (lang, song_id)
);

CREATE INDEX IF NOT EXISTS pool_songs_lang_pool_idx
  ON public.pool_songs (lang, pool);

ALTER TABLE public.chart_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pool_songs_select_anon
  ON public.pool_songs FOR SELECT TO anon USING (true);

CREATE POLICY pool_songs_select_authenticated
  ON public.pool_songs FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.pool_songs TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.pick_pool_song(
  p_lang text,
  p_pool text,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid,
  apple_id text,
  spotify_id text,
  title text,
  artist text,
  pool text,
  preview_url text,
  artwork_url text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.apple_id, s.spotify_id, s.title, s.artist, ps.pool, s.preview_url, s.artwork_url
  FROM public.pool_songs ps
  JOIN public.songs s ON s.id = ps.song_id
  WHERE ps.lang = p_lang
    AND ps.pool = p_pool
    AND (cardinality(p_exclude) = 0 OR s.id <> ALL (p_exclude))
  ORDER BY random()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pick_pool_song_recycle(
  p_lang text,
  p_pool text,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid,
  apple_id text,
  spotify_id text,
  title text,
  artist text,
  pool text,
  preview_url text,
  artwork_url text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.apple_id, s.spotify_id, s.title, s.artist, ps.pool, s.preview_url, s.artwork_url
  FROM public.pool_songs ps
  JOIN public.songs s ON s.id = ps.song_id
  WHERE ps.lang = p_lang
    AND ps.pool = p_pool
    AND (cardinality(p_exclude) = 0 OR s.id <> ALL (p_exclude))
  ORDER BY ps.last_seen ASC, ps.best_rank ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_pool_song(text, text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_pool_song_recycle(text, text, uuid[]) TO anon, authenticated;
