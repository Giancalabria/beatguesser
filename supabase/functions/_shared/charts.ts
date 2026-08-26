export const LANG_MODES = ["global", "es", "en"] as const;
export type LangMode = (typeof LANG_MODES)[number];

export const POOLS = ["easy", "medium", "hard", "expert", "impossible"] as const;
export type Pool = (typeof POOLS)[number];

export const ALL_MARKETS = ["us", "gb", "ar", "mx", "es", "br", "de", "fr"] as const;
export const SPANISH_MARKETS = ["ar", "mx", "es"] as const;
export const ENGLISH_MARKETS = ["us", "gb"] as const;
export const LATIN_GENRE_ID = "12";

export function poolFromBestRank(rank: number): Pool {
  if (rank <= 10) return "easy";
  if (rank <= 25) return "medium";
  if (rank <= 50) return "hard";
  if (rank <= 80) return "expert";
  return "impossible";
}

export function classifyBoards(input: {
  markets: Iterable<string>;
  genreIds: Iterable<string>;
  override?: LangMode | null;
}): LangMode[] {
  if (input.override && LANG_MODES.includes(input.override)) {
    return input.override === "global" ? ["global"] : ["global", input.override];
  }

  const markets = new Set([...input.markets].map((m) => m.toLowerCase()));
  const latin = [...input.genreIds].some((id) => id === LATIN_GENRE_ID);
  const hispanic = SPANISH_MARKETS.some((m) => markets.has(m));
  const anglo = ENGLISH_MARKETS.some((m) => markets.has(m));

  const boards: LangMode[] = ["global"];
  if ((hispanic && latin) || (hispanic && !anglo)) boards.push("es");
  if (anglo && !latin) boards.push("en");
  return boards;
}

export function bestRankForBoard(
  board: LangMode,
  ranksByMarket: Map<string, number>,
): number | null {
  const markets =
    board === "es" ? SPANISH_MARKETS : board === "en" ? ENGLISH_MARKETS : ALL_MARKETS;
  let best: number | null = null;
  for (const market of markets) {
    const rank = ranksByMarket.get(market);
    if (rank == null) continue;
    if (best == null || rank < best) best = rank;
  }
  if (board === "global" && best == null) {
    for (const rank of ranksByMarket.values()) {
      if (best == null || rank < best) best = rank;
    }
  }
  return best;
}
