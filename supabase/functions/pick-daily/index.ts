import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminKey, assertAuthorized, cors, json, mustEnv } from "../_shared/auth.ts";
import { LANG_MODES, POOLS, type LangMode, type Pool } from "../_shared/charts.ts";

const ART = "America/Argentina/Buenos_Aires";

interface PickRule {
  lang: LangMode;
  pool: Pool;
  cooldown_days: number;
  require_preview: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }

  try {
    assertAuthorized(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = body.force === true;
    const langFilter = parseLang(body.lang);
    const today = artDate();
    const targets = resolveTargets(body.target, today);
    const langs = langFilter ? [langFilter] : [...LANG_MODES];

    const supabase = createClient(mustEnv("SUPABASE_URL"), adminKey());
    const { data: rules, error: rulesError } = await supabase.from("pick_rules").select("*");
    if (rulesError) throw new Error(`pick_rules error: ${rulesError.message}`);

    const results: Record<string, unknown>[] = [];
    for (const date of targets) {
      // Fetch existing picks on this date across ALL languages to prevent same-day duplicates
      const { data: existingDatePicks } = await supabase
        .from("daily_picks")
        .select("song_id, lang, pool")
        .eq("date", date);

      const sessionBlocked = new Set<string>();
      if (!force && existingDatePicks) {
        for (const pick of existingDatePicks) {
          if (pick.song_id) sessionBlocked.add(pick.song_id);
        }
      }

      for (const lang of langs) {
        for (const pool of POOLS) {
          const rule = (rules ?? []).find((r) => r.lang === lang && r.pool === pool) as
            | PickRule
            | undefined;
          if (!rule) throw new Error(`missing pick_rules for ${lang}/${pool}`);
          results.push(await pickPool(supabase, lang, pool, date, rule, force, sessionBlocked));
        }
      }
    }

    return json({ ok: true, dates: targets, langs, results });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object"
          ? JSON.stringify(err)
          : String(err);
    return json({ ok: false, error: message }, 400);
  }
});

function parseLang(value: unknown): LangMode | null {
  if (typeof value === "string" && (LANG_MODES as readonly string[]).includes(value)) {
    return value as LangMode;
  }
  return null;
}

function artDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function resolveTargets(target: unknown, today: string): string[] {
  if (target === "today") return [today];
  if (target === "tomorrow") return [addDays(today, 1)];
  if (typeof target === "string" && /^\d{4}-\d{2}-\d{2}$/.test(target)) return [target];
  return [today, addDays(today, 1)];
}

async function pickPool(
  supabase: SupabaseClient,
  lang: LangMode,
  pool: Pool,
  date: string,
  rule: PickRule,
  force: boolean,
  sessionBlocked: Set<string>,
) {
  if (force) {
    await supabase.from("daily_picks").delete().eq("date", date).eq("lang", lang).eq("pool", pool);
  }

  const { data: existing } = await supabase
    .from("daily_picks")
    .select("song_id")
    .eq("date", date)
    .eq("lang", lang)
    .eq("pool", pool)
    .maybeSingle();

  if (existing?.song_id && !force) {
    sessionBlocked.add(existing.song_id);
    return { date, lang, pool, status: "already_set", song_id: existing.song_id };
  }

  // Fetch candidates from pool_songs
  const { data: candidates, error } = await supabase
    .from("pool_songs")
    .select("song_id, best_rank, songs!inner(id, title, artist, preview_url)")
    .eq("lang", lang)
    .eq("pool", pool);
  if (error) throw new Error(`pool_songs query failed: ${error.message}`);

  if (!candidates || candidates.length === 0) {
    return { date, lang, pool, status: "no_candidate", detail: "no songs in pool_songs" };
  }

  // Historical cooldown across all boards
  const cooldownBlocked = await recentSongIds(supabase, date, rule.cooldown_days);
  const fullBlocked = new Set([...cooldownBlocked, ...sessionBlocked]);

  // Try picking strictly respecting cooldown and same-day blocklist
  let eligible = candidates.filter((row) => {
    if (fullBlocked.has(row.song_id)) return false;
    const song = unwrapSong(row.songs);
    if (!song) return false;
    if (rule.require_preview && !song.preview_url) return false;
    return true;
  });

  // Fallback if cooldown exhausted the pool: relax historical cooldown, but STRICTLY keep same-day sessionBlocked
  if (eligible.length === 0) {
    eligible = candidates.filter((row) => {
      if (sessionBlocked.has(row.song_id)) return false;
      const song = unwrapSong(row.songs);
      if (!song) return false;
      if (rule.require_preview && !song.preview_url) return false;
      return true;
    });
  }

  if (eligible.length === 0) {
    return {
      date,
      lang,
      pool,
      status: "no_candidate",
      detail: "all candidates already picked today across boards",
    };
  }

  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  const song = unwrapSong(chosen.songs);
  if (!song) {
    return { date, lang, pool, status: "no_candidate", detail: "missing song join" };
  }

  const { error: pickError } = await supabase.from("daily_picks").upsert(
    {
      date,
      lang,
      pool,
      song_id: song.id,
    },
    { onConflict: "date,lang,pool" },
  );
  if (pickError) throw new Error(`daily_picks upsert failed: ${pickError.message}`);

  sessionBlocked.add(song.id);
  return {
    date,
    lang,
    pool,
    status: "picked",
    song_id: song.id,
    title: song.title,
    artist: song.artist,
    best_rank: chosen.best_rank,
  };
}

async function recentSongIds(
  supabase: SupabaseClient,
  date: string,
  cooldownDays: number,
): Promise<Set<string>> {
  const from = addDays(date, -cooldownDays);
  const { data } = await supabase
    .from("daily_picks")
    .select("song_id")
    .gte("date", from)
    .lt("date", date);
  return new Set((data ?? []).map((row) => row.song_id as string));
}

function unwrapSong(raw: unknown): {
  id: string;
  title: string;
  artist: string;
  preview_url: string | null;
} | null {
  const song = Array.isArray(raw) ? raw[0] : raw;
  if (!song || typeof song !== "object") return null;
  const row = song as { id?: string; title?: string; artist?: string; preview_url?: string | null };
  if (!row.id || !row.title || !row.artist) return null;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    preview_url: row.preview_url ?? null,
  };
}
