import { MatchResult, PlayerStat, ResolveContext, TeamStat } from "../src/engines";

/** Stat joueur avec des valeurs neutres — on ne renseigne que ce qui compte au test. */
export function player(playerId: string, over: Partial<PlayerStat> = {}): PlayerStat {
  return {
    playerId,
    teamId: over.teamId ?? "XXX",
    matchId: over.matchId ?? "m1",
    week: over.week ?? 1,
    anyTd: over.anyTd ?? 0,
    receivingTd: over.receivingTd ?? 0,
    rushingTd: over.rushingTd ?? 0,
    rushingYards: over.rushingYards ?? 0,
    passingInt: over.passingInt ?? 0,
    fgLongest: over.fgLongest ?? null,
    position: over.position ?? "OTHER",
    startedAtQB: over.startedAtQB ?? false,
  };
}

export function match(matchId: string, home: string, away: string, homeScore: number, awayScore: number): MatchResult {
  return {
    matchId,
    homeTeamId: home,
    awayTeamId: away,
    homeScore,
    awayScore,
    winnerTeamId: homeScore === awayScore ? "TIE" : homeScore > awayScore ? home : away,
    margin: Math.abs(homeScore - awayScore),
  };
}

export function team(teamId: string, over: Partial<TeamStat> = {}): TeamStat {
  return {
    teamId,
    week: over.week ?? 1,
    pointsScored: over.pointsScored ?? 0,
    pointsConceded: over.pointsConceded ?? 0,
    won: over.won ?? false,
    winningMargin: over.winningMargin ?? null,
  };
}

/** Indexe une liste par une de ses clés. */
const index = <T, K extends keyof T>(list: T[], key: K): Record<string, T> =>
  Object.fromEntries(list.map((x) => [String(x[key]), x]));

export function ctx(over: {
  config: any;
  entries: Array<{ uid: string; answer: any; late?: boolean }>;
  results?: MatchResult[];
  playerStats?: PlayerStat[];
  teamStats?: TeamStat[];
  weekScores?: Record<string, number>;
  votes?: any;
  runtime?: Record<string, unknown>;
}): ResolveContext<any, any> {
  return {
    bonusId: "b1",
    week: 1,
    config: over.config,
    entries: over.entries.map((e) => ({ uid: e.uid, answer: e.answer, late: e.late ?? false })),
    results: index(over.results ?? [], "matchId"),
    playerStats: index(over.playerStats ?? [], "playerId"),
    teamStats: index(over.teamStats ?? [], "teamId"),
    weekScores: over.weekScores ?? {},
    votes: over.votes ?? { matchVotes: {}, teamWagerCounts: {} },
    runtime: over.runtime,
  };
}

/** Points attribués à un uid (0 si le moteur ne l'a pas récompensé). */
export const pts = (res: Record<string, { points: number }>, uid: string): number => res[uid]?.points ?? 0;
