-- BeatGuesser initial schema

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text NOT NULL,
  preview_url text,
  isrc text UNIQUE,
  pool text NOT NULL CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  lang text NOT NULL DEFAULT 'en',
  popularity int NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX songs_pool_idx ON public.songs (pool);

CREATE TABLE public.daily_picks (
  date date NOT NULL,
  pool text NOT NULL CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  song_id uuid NOT NULL REFERENCES public.songs (id),
  PRIMARY KEY (date, pool)
);

CREATE TABLE public.daily_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  device_id text,
  date date NOT NULL,
  pool text NOT NULL CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  won boolean NOT NULL,
  segments_used int NOT NULL,
  clip_seconds numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX daily_results_user_date_pool_idx
  ON public.daily_results (date, pool, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX daily_results_device_date_pool_idx
  ON public.daily_results (date, pool, device_id)
  WHERE device_id IS NOT NULL;

CREATE TABLE public.infinite_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  device_id text,
  pool text NOT NULL CHECK (pool IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  score int NOT NULL DEFAULT 0,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infinite_runs ENABLE ROW LEVEL SECURITY;

-- songs: read-only for clients
CREATE POLICY songs_select_anon
  ON public.songs
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY songs_select_authenticated
  ON public.songs
  FOR SELECT
  TO authenticated
  USING (true);

-- daily_picks: read-only for clients
CREATE POLICY daily_picks_select_anon
  ON public.daily_picks
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY daily_picks_select_authenticated
  ON public.daily_picks
  FOR SELECT
  TO authenticated
  USING (true);

-- daily_results: authenticated users manage their own rows
CREATE POLICY daily_results_select_own
  ON public.daily_results
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY daily_results_insert_own
  ON public.daily_results
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- infinite_runs: authenticated users manage their own rows
CREATE POLICY infinite_runs_select_own
  ON public.infinite_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY infinite_runs_insert_own
  ON public.infinite_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.songs TO anon, authenticated;
GRANT SELECT ON public.daily_picks TO anon, authenticated;
GRANT SELECT, INSERT ON public.daily_results TO authenticated;
GRANT SELECT, INSERT ON public.infinite_runs TO authenticated;
