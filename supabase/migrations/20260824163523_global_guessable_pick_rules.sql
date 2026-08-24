-- Keep every pool in globally recognizable hits.
-- Expert / Impossible stay harder, but never dip into obscure or local-only catalog.
UPDATE public.pick_rules AS r SET
  min_popularity = v.min_pop,
  max_popularity = v.max_pop
FROM (VALUES
  ('easy',       82, 100),
  ('medium',     74,  86),
  ('hard',       66,  78),
  ('expert',     58,  70),
  ('impossible', 50,  62)
) AS v(pool, min_pop, max_pop)
WHERE r.pool = v.pool;
