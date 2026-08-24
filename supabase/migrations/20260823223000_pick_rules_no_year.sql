-- Difficulty is popularity, not recency. Easy can be a 70s classic or a 2024 hit.
UPDATE public.pick_rules SET spotify_query = NULL;

COMMENT ON COLUMN public.pick_rules.spotify_query IS
  'Optional extra Spotify Search q. Leave NULL to search any era; difficulty comes from min/max_popularity.';
