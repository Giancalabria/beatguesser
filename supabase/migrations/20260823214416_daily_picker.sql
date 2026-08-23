-- Daily picker: rules + schedule tomorrow after the ART midnight switch.
-- The "switch" is the calendar date on daily_picks. At 00:00 ART clients
-- start reading today's rows (already inserted yesterday). This job then
-- fills tomorrow so the next switch is instant.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.pick_rules (
  pool text PRIMARY KEY CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  min_popularity int NOT NULL CHECK (min_popularity BETWEEN 0 AND 100),
  max_popularity int NOT NULL CHECK (max_popularity BETWEEN 0 AND 100),
  cooldown_days int NOT NULL CHECK (cooldown_days >= 0),
  require_preview boolean NOT NULL DEFAULT false,
  CONSTRAINT pick_rules_pop_range CHECK (min_popularity <= max_popularity)
);

ALTER TABLE public.pick_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY pick_rules_select_anon
  ON public.pick_rules FOR SELECT TO anon USING (true);

CREATE POLICY pick_rules_select_authenticated
  ON public.pick_rules FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.pick_rules TO anon, authenticated;

-- Spotify popularity 0–100 stored on songs.popularity (refresh separately).
INSERT INTO public.pick_rules (pool, min_popularity, max_popularity, cooldown_days, require_preview)
VALUES
  ('easy',       75, 100, 21, false),
  ('medium',     55,  79, 21, false),
  ('hard',       35,  59, 30, false),
  ('expert',     18,  44, 45, false),
  ('impossible',  0,  29, 60, false);

CREATE OR REPLACE FUNCTION private.art_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('America/Argentina/Buenos_Aires', now()))::date;
$$;

CREATE OR REPLACE FUNCTION private.eligible_songs(
  p_pool text,
  p_target date,
  p_min_pop int,
  p_max_pop int,
  p_cooldown int,
  p_require_preview boolean
)
RETURNS SETOF public.songs
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.*
  FROM public.songs s
  WHERE s.pool = p_pool
    AND s.popularity BETWEEN p_min_pop AND p_max_pop
    AND (NOT p_require_preview OR s.preview_url IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_picks dp
      WHERE dp.song_id = s.id
        AND dp.date >= (p_target - p_cooldown)
        AND dp.date < p_target
    );
$$;

CREATE OR REPLACE FUNCTION private.pick_one_song(
  p_pool text,
  p_target date
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r public.pick_rules%ROWTYPE;
  chosen uuid;
BEGIN
  SELECT * INTO r FROM public.pick_rules WHERE pool = p_pool;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'missing pick_rules for pool %', p_pool;
  END IF;

  -- 1) full rules
  SELECT id INTO chosen
  FROM private.eligible_songs(p_pool, p_target, r.min_popularity, r.max_popularity, r.cooldown_days, r.require_preview)
  ORDER BY random()
  LIMIT 1;
  IF chosen IS NOT NULL THEN
    RETURN chosen;
  END IF;

  -- 2) drop cooldown
  SELECT id INTO chosen
  FROM private.eligible_songs(p_pool, p_target, r.min_popularity, r.max_popularity, 0, r.require_preview)
  ORDER BY random()
  LIMIT 1;
  IF chosen IS NOT NULL THEN
    RETURN chosen;
  END IF;

  -- 3) pool only, keep cooldown
  SELECT s.id INTO chosen
  FROM public.songs s
  WHERE s.pool = p_pool
    AND (NOT r.require_preview OR s.preview_url IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.daily_picks dp
      WHERE dp.song_id = s.id
        AND dp.date >= (p_target - r.cooldown_days)
        AND dp.date < p_target
    )
  ORDER BY random()
  LIMIT 1;
  IF chosen IS NOT NULL THEN
    RETURN chosen;
  END IF;

  -- 4) any song in the pool
  SELECT s.id INTO chosen
  FROM public.songs s
  WHERE s.pool = p_pool
  ORDER BY random()
  LIMIT 1;

  RETURN chosen;
END;
$$;

CREATE OR REPLACE FUNCTION private.pick_daily_for_date(p_target date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p text;
  sid uuid;
BEGIN
  FOREACH p IN ARRAY ARRAY['easy','medium','hard','expert','impossible'] LOOP
    IF EXISTS (
      SELECT 1 FROM public.daily_picks WHERE date = p_target AND pool = p
    ) THEN
      CONTINUE;
    END IF;

    sid := private.pick_one_song(p, p_target);
    IF sid IS NULL THEN
      RAISE WARNING 'no eligible song for pool % on %', p, p_target;
      CONTINUE;
    END IF;

    INSERT INTO public.daily_picks (date, pool, song_id)
    VALUES (p_target, p, sid);
  END LOOP;
END;
$$;

-- After ART midnight: today's picks are already live. Fill tomorrow.
-- If today is missing (first deploy / failed job), backfill today first.
CREATE OR REPLACE FUNCTION private.rotate_daily_picks()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  today date := private.art_today();
BEGIN
  PERFORM private.pick_daily_for_date(today);
  PERFORM private.pick_daily_for_date(today + 1);
END;
$$;

REVOKE ALL ON FUNCTION private.art_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.eligible_songs(text, date, int, int, int, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pick_one_song(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pick_daily_for_date(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rotate_daily_picks() FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('beatguesser-rotate-daily');
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'beatguesser-rotate-daily',
  '5 3 * * *',
  $cron$SELECT private.rotate_daily_picks();$cron$
);

COMMENT ON COLUMN public.songs.popularity IS 'Spotify popularity 0-100; used by private.pick_one_song';

SELECT private.rotate_daily_picks();
