/**
 * NFL BET — Moteur de bonus (back-end)
 * ------------------------------------------------------------------
 * Squelette TypeScript des 14 moteurs de bonus + modèle de stats normalisé.
 * Destiné aux Cloud Functions (Node). Dépend de `zod`.
 *
 * Principe : le scoring NE dépend JAMAIS du provider. Il lit un modèle de
 * stats NORMALISÉ (PlayerStat / TeamStat / MatchResult) alimenté par un
 * adaptateur provider (API-Sports…) OU par la saisie admin (override).
 *
 * Chaque moteur expose :
 *   - configSchema : ce que l'admin règle (validé à la création du bonus)
 *   - answerSchema : ce que le joueur saisit (validé à la soumission)
 *   - requiredInputs : les données nécessaires à la résolution
 *   - resolve(ctx) : (uid -> { points, detail }) pour la semaine
 *
 * Les blocs `// TODO` marquent la logique métier à finaliser côté back.
 */

import { z } from "zod";

/* ================================================================
 * 1. MODÈLE DE DONNÉES NORMALISÉ (inputs de résolution)
 * ================================================================ */

export type TeamId = string;
export type PlayerId = string;
export type MatchId = string;
export type Uid = string;

/** Résultat d'un match, une fois FINAL. */
export interface MatchResult {
  matchId: MatchId;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  homeScore: number;
  awayScore: number;
  winnerTeamId: TeamId | "TIE";
  margin: number; // |home - away|
}

/** Stats d'UN joueur sur UNE semaine (normalisées, hors 2-pt conversions pour les TD). */
export interface PlayerStat {
  playerId: PlayerId;
  teamId: TeamId;
  matchId: MatchId;
  week: number;
  anyTd: number;          // TD marqués (rush + rec + return), hors conversions 2 pts
  receivingTd: number;
  rushingTd: number;
  rushingYards: number;
  passingInt: number;     // interceptions LANCÉES (pour QB)
  fgLongest: number | null; // plus long FG réussi (yards), null si aucun
  position: "QB" | "RB" | "WR" | "TE" | "K" | "OTHER";
  startedAtQB: boolean;   // a réellement lancé (règle du remplaçant)
}

/** Stats d'UNE équipe sur UNE semaine (dérivées des matchs). */
export interface TeamStat {
  teamId: TeamId;
  week: number;
  pointsScored: number;
  pointsConceded: number;
  won: boolean;
  winningMargin: number | null; // margin si victoire, sinon null
}

/** Agrégats de votes (pour GOTW / uniqueness), calculés au lock. */
export interface VoteAggregate {
  /** matchId -> teamId -> nombre de votes (parmi les entries valides) */
  matchVotes: Record<MatchId, Record<TeamId, number>>;
  /** teamId -> nombre de joueurs ayant parié cette équipe dans un TEAM_WAGER donné */
  teamWagerCounts: Record<string /*bonusId*/, Record<TeamId, number>>;
}

/** Contexte fourni à chaque resolve(). Les champs inutiles au moteur sont ignorés. */
export interface ResolveContext<Cfg, Answer> {
  bonusId: string;
  week: number;
  config: Cfg;
  /** entries valides ; `late` sert aux règles d'uniqueness (retardataires exclus). */
  entries: Array<{ uid: Uid; answer: Answer; late: boolean }>;
  results: Record<MatchId, MatchResult>;
  playerStats: Record<PlayerId, PlayerStat>;
  teamStats: Record<TeamId, TeamStat>;
  /** score de jeu (hors bonus) de la semaine, pour POOL/DUO. */
  weekScores: Record<Uid, number>;
  votes: VoteAggregate;
  /** pools/duos éventuellement figés à la config (runtime du bonus). */
  runtime?: Record<string, unknown>;
}

export type ResolveResult = Record<Uid, { points: number; detail: string }>;

export type InputKind =
  | "MATCH_RESULTS"
  | "PLAYER_STATS"
  | "TEAM_STATS"
  | "WEEK_SCORES"
  | "VOTES";

export interface BonusEngine<Cfg = unknown, Answer = unknown> {
  type: string;
  configSchema: z.ZodType<Cfg>;
  answerSchema: z.ZodType<Answer>;
  requiredInputs: InputKind[];
  resolve(ctx: ResolveContext<Cfg, Answer>): ResolveResult;
}

/* Helpers ---------------------------------------------------------- */
const cap = (n: number, max: number) => Math.min(n, max);
const activeEntries = <A>(ctx: ResolveContext<any, A>, excludeLate: boolean) =>
  ctx.entries.filter((e) => (excludeLate ? !e.late : true));

/**
 * Élimination des sélections partagées (Choose Your Champ, Dumpster, RB Duos).
 *
 * Règlement : « un retardataire ne peut pas affecter le bonus d'un joueur qui
 * ne l'est pas ». On compte donc les doublons parmi les grilles à l'heure ; un
 * retardataire, lui, est éliminé dès qu'il partage sa sélection avec quiconque.
 */
function eliminationCheck(
  entries: Array<{ answer: unknown; late: boolean }>,
  selections: (answer: unknown) => string[]
): (selection: string, late: boolean) => boolean {
  const onTime: Record<string, number> = {};
  const all: Record<string, number> = {};
  for (const e of entries) {
    for (const sel of selections(e.answer)) {
      all[sel] = (all[sel] ?? 0) + 1;
      if (!e.late) onTime[sel] = (onTime[sel] ?? 0) + 1;
    }
  }
  return (sel, late) => (late ? (all[sel] ?? 0) >= 2 : (onTime[sel] ?? 0) >= 2);
}

/* ================================================================
 * 2. MOTEURS
 * ================================================================ */

/* ---- 1. GAME_PICKS (base) ---------------------------------------
 * NB : le scoring de base n'est pas un "bonus" ; il est ici pour mémoire.
 * Il est calculé directement par la fonction de scoring principale.
 */
export const GAME_PICKS_CONFIG = z.object({ pointsPerCorrect: z.number().default(1) });

/* ---- 2. PERFECT_WEEK --------------------------------------------
 * Dérivé (pas de saisie). Résolu par la fonction de scoring principale
 * qui connaît correctPicks/totalPicks. Config seulement.
 */
export const PERFECT_WEEK_CONFIG = z.object({
  points: z.number().default(10),
  includeGOTW: z.boolean().default(true),
  includeBonusQuestions: z.boolean().default(false),
});

/* ---- 3. GAME_OF_THE_WEEK ----------------------------------------
 * Match le plus proche de 50/50 (via votes). Correct pickers -> points.
 */

/**
 * Détermine le Game of the Week d'une semaine :
 *  - soit le match figé par l'admin (`config.gotwMatchId`),
 *  - soit le match dont le split des pronos est le plus proche de 50/50.
 *
 * Le parcours est trié par matchId pour que l'égalité parfaite soit départagée
 * de façon déterministe : deux exécutions du scoring donnent le même GOTW.
 * Exporté car le scoring principal l'appelle aussi, pour persister le résultat
 * sur le doc de la semaine (sinon le choix serait perdu et l'écran de
 * révélation n'aurait rien à afficher).
 */
export function pickGotwMatchId(
  config: { gotwMatchId?: string } | undefined,
  matchVotes: Record<MatchId, Record<TeamId, number>>
): MatchId | null {
  if (config?.gotwMatchId) return config.gotwMatchId;
  let best: { id: MatchId; dist: number } | null = null;
  for (const mid of Object.keys(matchVotes || {}).sort()) {
    const counts = Object.values(matchVotes[mid] || {});
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const top = Math.max(...counts);
    const dist = Math.abs(top / total - 0.5); // 0 = parfaitement 50/50
    if (!best || dist < best.dist) best = { id: mid, dist };
  }
  return best?.id ?? null;
}
export const gameOfTheWeek: BonusEngine = {
  type: "GAME_OF_THE_WEEK",
  configSchema: z.object({
    points: z.number().default(2),
    tieBreak: z.enum(["MANUAL_VOTE", "ADMIN"]).default("ADMIN"),
    /** défini au lock si égalité de contestation */
    gotwMatchId: z.string().optional(),
  }),
  answerSchema: z.object({}).strict(), // aucune saisie dédiée : on lit gamePicks
  requiredInputs: ["MATCH_RESULTS", "VOTES"],
  resolve(ctx) {
    const cfg = ctx.config as { points: number; gotwMatchId?: string };
    const out: ResolveResult = {};
    const gotw = pickGotwMatchId(cfg, ctx.votes.matchVotes);
    if (!gotw) return out;
    const winner = ctx.results[gotw]?.winnerTeamId;
    // Récompense les joueurs ayant pické le vainqueur du GOTW. La réponse du
    // bonus est vide : on relit les gamePicks, injectés par le scoring principal.
    for (const e of ctx.entries) {
      const pick = (ctx.runtime?.[`gamePicks_${e.uid}`] as Record<MatchId, TeamId>)?.[gotw];
      if (pick && pick === winner) out[e.uid] = { points: cfg.points, detail: `GOTW ${gotw} ✔` };
    }
    return out;
  },
};

/* ---- 4. PERIOD_LEADER (WW3) -------------------------------------
 * Leader(s) au cumul sur [fromWeek, toWeek] -> points. Résolu à la fin de toWeek.
 */
export const periodLeader: BonusEngine = {
  type: "PERIOD_LEADER",
  configSchema: z.object({
    fromWeek: z.number(),
    toWeek: z.number(),
    points: z.number().default(3),
  }),
  answerSchema: z.object({}).strict(),
  requiredInputs: ["WEEK_SCORES"],
  resolve(ctx) {
    // ctx.runtime.cumulativeScores : uid -> total sur la période (fourni par le scoring)
    const cfg = ctx.config as { points: number };
    const cum = (ctx.runtime?.cumulativeScores ?? {}) as Record<Uid, number>;
    const out: ResolveResult = {};
    const max = Math.max(...Object.values(cum));
    for (const [uid, s] of Object.entries(cum))
      if (s === max) out[uid] = { points: cfg.points, detail: "Leader période" };
    return out;
  },
};

/* ---- 5. TEAM_WAGER (Melvyn / Quitte ou Double) ------------------ */
export const teamWager: BonusEngine = {
  type: "TEAM_WAGER",
  configSchema: z.object({
    optional: z.boolean().default(false),
    soleWinPoints: z.number().default(2),
    sharedWinPoints: z.number().default(0),
    losePoints: z.number().default(0),
    excludeLateFromUniqueness: z.boolean().default(true),
  }),
  answerSchema: z.object({ teamId: z.string().optional() }),
  requiredInputs: ["MATCH_RESULTS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // compter combien de joueurs (non-late) ont choisi chaque équipe
    const counts: Record<TeamId, number> = {};
    for (const e of activeEntries(ctx, cfg.excludeLateFromUniqueness)) {
      const t = (e.answer as any).teamId;
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const e of ctx.entries) {
      const t = (e.answer as any).teamId as TeamId | undefined;
      if (!t) continue;
      const won = teamWon(ctx, t);
      if (won === null) continue; // équipe pas jouée / résultat manquant
      if (won) {
        const sole = (counts[t] ?? 0) <= 1;
        out[e.uid] = {
          points: sole ? cfg.soleWinPoints : cfg.sharedWinPoints,
          detail: sole ? `${t} gagne (seul)` : `${t} gagne (partagé)`,
        };
      } else {
        out[e.uid] = { points: cfg.losePoints, detail: `${t} perd` };
      }
    }
    return out;
  },
};

/* ---- 6. UPSET ---------------------------------------------------
 * Dérivé des gamePicks. Nécessite la forme des équipes AVANT la semaine.
 */
export const upset: BonusEngine = {
  type: "UPSET",
  configSchema: z.object({
    points: z.number().default(2),
    betOnWinless: z.boolean().default(true),
    betAgainstUndefeated: z.boolean().default(true),
  }),
  answerSchema: z.object({}).strict(),
  requiredInputs: ["MATCH_RESULTS", "TEAM_STATS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // ctx.runtime.preWeekRecords : teamId -> { wins, losses } avant la semaine
    const rec = (ctx.runtime?.preWeekRecords ?? {}) as Record<TeamId, { wins: number; losses: number }>;
    for (const e of ctx.entries) {
      const picks = (ctx.runtime?.[`gamePicks_${e.uid}`] as Record<MatchId, TeamId>) ?? {};
      let pts = 0;
      let detail = "";
      for (const [mid, pickedTeam] of Object.entries(picks)) {
        const r = ctx.results[mid];
        if (!r) continue;
        const opponent = pickedTeam === r.homeTeamId ? r.awayTeamId : r.homeTeamId;
        const pickedWon = r.winnerTeamId === pickedTeam;
        // Une équipe qui n'a pas encore joué n'est ni « sans victoire » ni
        // « invaincue » : sans ce garde-fou, la semaine 1 (tout le monde à 0-0)
        // rapporterait le double des points sur chaque bon pronostic.
        const played = (t: TeamId) => !!rec[t] && rec[t].wins + rec[t].losses > 0;
        // pari SUR une équipe sans victoire qui gagne
        if (cfg.betOnWinless && played(pickedTeam) && rec[pickedTeam].wins === 0 && pickedWon) {
          pts += cfg.points; detail += `upset ${pickedTeam} `;
        }
        // pari CONTRE une équipe invaincue qui perd
        if (cfg.betAgainstUndefeated && played(opponent) && rec[opponent].losses === 0 && pickedWon) {
          pts += cfg.points; detail += `anti-invaincu ${opponent} `;
        }
      }
      if (pts) out[e.uid] = { points: pts, detail: detail.trim() };
    }
    return out;
  },
};

/* ---- 7. PLAYER_STAT_PICKS ---------------------------------------
 * Trust Your WR / QB Death Match / Choose Your Champ / Dumpster / National TE Day
 */
export const playerStatPicks: BonusEngine = {
  type: "PLAYER_STAT_PICKS",
  configSchema: z.object({
    selectionMin: z.number().default(1),
    selectionMax: z.number().default(3),
    entity: z.enum(["PLAYER", "MATCH_TE"]).default("PLAYER"),
    statKey: z.enum(["ANY_TD", "RECEIVING_TD", "PASSING_INT", "TE_TD_IN_MATCH"]),
    threshold: z.number().default(1),
    scoring: z.enum(["GATED_EACH", "COUNT_CAPPED"]),
    pointsPerHit: z.number().default(1),
    cap: z.number().default(3),
    dedupe: z.enum(["NONE", "ELIMINATE"]).default("NONE"),
  }),
  answerSchema: z.union([
    z.object({ players: z.array(z.string()).min(1).max(3) }), // entity PLAYER
    z.object({ matches: z.array(z.string()).length(3) }),      // entity MATCH_TE
  ]),
  requiredInputs: ["PLAYER_STATS", "MATCH_RESULTS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};

    // 1) dedupe ELIMINATE : sélections choisies par ≥2 joueurs
    const isEliminated =
      cfg.dedupe === "ELIMINATE" ? eliminationCheck(ctx.entries, selectionsOf) : () => false;

    for (const e of ctx.entries) {
      const sels = selectionsOf(e.answer).filter((s) => !isEliminated(s, e.late));
      const hits = sels.map((s) => statValue(ctx, cfg, s)); // valeur de la stat par sélection

      let points = 0;
      if (cfg.scoring === "GATED_EACH") {
        // tous doivent atteindre le seuil, sinon 0 ; sinon +pointsPerHit par sélection
        const allHit = sels.length > 0 && hits.every((v) => v >= cfg.threshold);
        points = allHit ? cap(sels.length * cfg.pointsPerHit, cfg.cap) : 0;
      } else {
        // COUNT_CAPPED : somme des occurrences (ex. nb de TD / INT) plafonnée
        points = cap(hits.reduce((a, b) => a + b, 0), cfg.cap);
      }
      if (points) out[e.uid] = { points, detail: `${sels.length} sél., ${points} pt` };
    }
    return out;
  },
};

/* ---- 8. STAT_LEADERBOARD (RB Death Match Duos) ------------------ */
export const statLeaderboard: BonusEngine = {
  type: "STAT_LEADERBOARD",
  configSchema: z.object({
    selectionCount: z.number().default(2),
    statKey: z.enum(["RUSHING_YARDS"]),
    dedupe: z.enum(["NONE", "ELIMINATE"]).default("ELIMINATE"),
    aggregate: z.literal("SUM").default("SUM"),
    award: z.record(z.string(), z.number()).default({ "1": 3 }), // rang -> points
  }),
  answerSchema: z.object({ players: z.array(z.string()) }),
  requiredInputs: ["PLAYER_STATS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    // 1) éliminer les joueurs choisis par ≥2 participants
    const players = (a: unknown) => ((a as any)?.players ?? []) as string[];
    const isEliminated = cfg.dedupe === "ELIMINATE" ? eliminationCheck(ctx.entries, players) : () => false;
    // 2) score de chaque participant = somme rushing yards des joueurs restants
    const totals = ctx.entries.map((e) => ({
      uid: e.uid,
      total: players(e.answer)
        .filter((p) => !isEliminated(p, e.late))
        .reduce((s: number, p: string) => s + (ctx.playerStats[p]?.rushingYards ?? 0), 0),
    }));
    // 3) classer et attribuer award (ex æquo au rang 1 = tous récompensés).
    // Un total nul ne gagne rien : sinon, une semaine où tout le monde est
    // éliminé récompenserait tout le monde.
    const out: ResolveResult = {};
    const max = Math.max(0, ...totals.map((t) => t.total));
    if (max <= 0) return out;
    for (const t of totals)
      if (t.total === max && cfg.award["1"]) out[t.uid] = { points: cfg.award["1"], detail: `${t.total} yds` };
    return out;
  },
};

/* ---- 9. MATCH_THE_LEADER (Kickerz) ------------------------------ */
export const matchTheLeader: BonusEngine = {
  type: "MATCH_THE_LEADER",
  configSchema: z.object({
    statKey: z.enum(["FG_LONGEST"]),
    solePoints: z.number().default(3),
    sharedPoints: z.number().default(1),
    fallbackChain: z.boolean().default(true),
  }),
  answerSchema: z.object({ playerId: z.string() }),
  requiredInputs: ["PLAYER_STATS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // leaderboard décroissant sur FG_LONGEST
    const board = Object.values(ctx.playerStats)
      .filter((p) => p.fgLongest != null)
      .sort((a, b) => (b.fgLongest! - a.fgLongest!))
      .map((p) => p.playerId);
    // descendre la chaîne jusqu'à trouver un kicker nommé par ≥1 joueur
    for (const leader of board) {
      const namers = ctx.entries.filter((e) => (e.answer as any).playerId === leader);
      if (namers.length === 0) { if (cfg.fallbackChain) continue; else break; }
      const sole = namers.length === 1;
      for (const e of namers)
        out[e.uid] = { points: sole ? cfg.solePoints : cfg.sharedPoints, detail: `Kicker ${leader}` };
      break;
    }
    return out;
  },
};

/* ---- 10. TEAM_STAT_QUESTIONS (Puntos) --------------------------- */
export const teamStatQuestions: BonusEngine = {
  type: "TEAM_STAT_QUESTIONS",
  configSchema: z.object({
    cap: z.number().default(3),
    questions: z.array(
      z.object({
        id: z.string(),
        metric: z.enum(["TEAM_POINTS_SCORED", "TEAM_POINTS_CONCEDED", "WINNING_MARGIN"]),
        extreme: z.enum(["MAX", "MIN", "MIN_AMONG_WINNERS"]),
        points: z.number().default(1),
      })
    ),
  }),
  answerSchema: z.object({ answers: z.record(z.string(), z.string()) }),
  requiredInputs: ["TEAM_STATS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // pour chaque question, calculer l'ensemble des équipes "bonne réponse"
    const correct: Record<string, Set<TeamId>> = {};
    for (const q of cfg.questions) correct[q.id] = winningTeamsForMetric(ctx, q);
    for (const e of ctx.entries) {
      let pts = 0;
      for (const q of cfg.questions) {
        const ans = (e.answer as any).answers?.[q.id];
        if (ans && correct[q.id].has(ans)) pts += q.points;
      }
      pts = cap(pts, cfg.cap);
      if (pts) out[e.uid] = { points: pts, detail: `${pts} bonne(s) réponse(s)` };
    }
    return out;
  },
};

/* ---- 11. POOL_COMPETITION (Cage Fight) -------------------------- */
export const poolCompetition: BonusEngine = {
  type: "POOL_COMPETITION",
  configSchema: z.object({
    poolSize: z.number().default(4),
    firstPlacePoints: z.number().default(3),
    tieRule: z.enum(["SHARED_ZERO", "SHARED_POINTS"]).default("SHARED_ZERO"),
  }),
  answerSchema: z.object({}).strict(),
  requiredInputs: ["WEEK_SCORES"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // pools figés à la config : runtime.pools = { A: [uid…], B: [uid…] }
    const pools = (ctx.runtime?.pools ?? {}) as Record<string, Uid[]>;
    for (const [name, members] of Object.entries(pools)) {
      const scored = members.map((uid) => ({ uid, s: ctx.weekScores[uid] ?? 0 }));
      const max = Math.max(...scored.map((x) => x.s));
      const leaders = scored.filter((x) => x.s === max);
      if (cfg.tieRule === "SHARED_ZERO" && leaders.length > 1) continue; // égalité de fiche -> 0
      for (const l of leaders)
        out[l.uid] = { points: cfg.firstPlacePoints, detail: `1er poule ${name}` };
    }
    return out;
  },
};

/* ---- 12. DUO_COMPETITION (Destins Liés) ------------------------- */
export const duoCompetition: BonusEngine = {
  type: "DUO_COMPETITION",
  configSchema: z.object({
    optIn: z.boolean().default(true),
    rankPoints: z.object({ first: z.number(), second: z.number(), last: z.number() }),
  }),
  answerSchema: z.object({ participate: z.boolean() }),
  requiredInputs: ["WEEK_SCORES"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    // duos tirés par l'admin : runtime.duos = [[uidA, uidB], …]
    const duos = (ctx.runtime?.duos ?? []) as Array<[Uid, Uid]>;
    const scored = duos.map((d) => ({ d, s: (ctx.weekScores[d[0]] ?? 0) + (ctx.weekScores[d[1]] ?? 0) }));
    scored.sort((a, b) => b.s - a.s);
    scored.forEach((entry, i) => {
      let pts = 0;
      if (i === 0) pts = cfg.rankPoints.first;
      else if (i === 1) pts = cfg.rankPoints.second;
      // « Dernier » n'existe qu'à partir de 3 duos : à 2, le deuxième est aussi
      // le dernier et la pénalité effacerait sa récompense.
      if (scored.length >= 3 && i === scored.length - 1) pts = cfg.rankPoints.last;
      if (pts) for (const uid of entry.d) out[uid] = { points: pts, detail: `Duo rang ${i + 1}` };
    });
    return out;
  },
};

/* ---- 13. LINKED_PARLAY (Thanksgiving Combine) ------------------- */
export const linkedParlay: BonusEngine = {
  type: "LINKED_PARLAY",
  configSchema: z.object({
    matchIds: z.array(z.string()),
    allCorrectPoints: z.number().default(3),
  }),
  answerSchema: z.object({ picks: z.record(z.string(), z.string()) }),
  requiredInputs: ["MATCH_RESULTS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    for (const e of ctx.entries) {
      const picks = (e.answer as any).picks ?? {};
      const allCorrect =
        cfg.matchIds.length > 0 &&
        cfg.matchIds.every((mid: MatchId) => picks[mid] && picks[mid] === ctx.results[mid]?.winnerTeamId);
      if (allCorrect) out[e.uid] = { points: cfg.allCorrectPoints, detail: "Parlay complet" };
    }
    return out;
  },
};

/* ---- 14. CUMULATIVE_COMBO (Combinaison Parfaite) ---------------- */
export const cumulativeCombo: BonusEngine = {
  type: "CUMULATIVE_COMBO",
  configSchema: z.object({
    cap: z.number().default(3),
    items: z.array(
      z.object({
        id: z.string(),
        matchId: z.string(),
        // deux QB : chacun "intercepté OUI/NON"
        qbHomePlayerId: z.string().optional(),
        qbAwayPlayerId: z.string().optional(),
        statKey: z.literal("PASSING_INT").default("PASSING_INT"),
      })
    ),
  }),
  answerSchema: z.object({
    items: z.record(z.string(), z.object({ QB_HOME: z.enum(["YES", "NO"]), QB_AWAY: z.enum(["YES", "NO"]) })),
  }),
  requiredInputs: ["PLAYER_STATS", "MATCH_RESULTS"],
  resolve(ctx) {
    const cfg = ctx.config as any;
    const out: ResolveResult = {};
    for (const e of ctx.entries) {
      let streak = 0;
      // points cumulatifs DANS L'ORDRE, s'arrête à la 1re rupture
      for (const item of cfg.items) {
        const ans = (e.answer as any).items?.[item.id];
        if (!ans) break;
        const homeInt = qbIntercepted(ctx, item.qbHomePlayerId, item.matchId, true);
        const awayInt = qbIntercepted(ctx, item.qbAwayPlayerId, item.matchId, false);
        const good = ynMatches(ans.QB_HOME, homeInt) && ynMatches(ans.QB_AWAY, awayInt);
        if (good) streak += 1;
        else break;
      }
      const pts = cap(streak, cfg.cap);
      if (pts) out[e.uid] = { points: pts, detail: `${pts} match(s) combo` };
    }
    return out;
  },
};

/* ================================================================
 * 3. REGISTRE + helpers métier (à finaliser)
 * ================================================================ */

export const ENGINES: Record<string, BonusEngine> = {
  GAME_OF_THE_WEEK: gameOfTheWeek,
  PERIOD_LEADER: periodLeader,
  TEAM_WAGER: teamWager,
  UPSET: upset,
  PLAYER_STAT_PICKS: playerStatPicks,
  STAT_LEADERBOARD: statLeaderboard,
  MATCH_THE_LEADER: matchTheLeader,
  TEAM_STAT_QUESTIONS: teamStatQuestions,
  POOL_COMPETITION: poolCompetition,
  DUO_COMPETITION: duoCompetition,
  LINKED_PARLAY: linkedParlay,
  CUMULATIVE_COMBO: cumulativeCombo,
  // PERFECT_WEEK & GAME_PICKS : gérés par le scoring principal (config-only)
};

/* --- Helpers (implémentations à compléter côté back) ------------- */

function teamWon(ctx: ResolveContext<any, any>, teamId: TeamId): boolean | null {
  const ts = ctx.teamStats[teamId];
  if (!ts) return null;
  return ts.won;
}

/** Retourne la liste des sélections d'une réponse PLAYER_STAT_PICKS. */
function selectionsOf(answer: unknown): string[] {
  const a = answer as any;
  return a?.players ?? a?.matches ?? [];
}

/** Valeur de la stat pour une sélection (joueur ou match-TE). */
function statValue(ctx: ResolveContext<any, any>, cfg: any, selection: string): number {
  if (cfg.entity === "MATCH_TE") {
    // TE_TD_IN_MATCH : 1 si un TE a marqué un TD dans ce match, sinon 0
    // TODO: parcourir playerStats des joueurs du match avec position === "TE" && anyTd >= 1
    return teMatchTd(ctx, selection) ? 1 : 0;
  }
  const p = ctx.playerStats[selection];
  if (!p) return 0;
  switch (cfg.statKey) {
    case "ANY_TD": return p.anyTd;
    case "RECEIVING_TD": return p.receivingTd;
    case "PASSING_INT": return p.passingInt;
    default: return 0;
  }
}

function teMatchTd(ctx: ResolveContext<any, any>, matchId: MatchId): boolean {
  return Object.values(ctx.playerStats).some(
    (p) => p.matchId === matchId && p.position === "TE" && p.anyTd >= 1
  );
}

/** Détermine si le QB (ou son remplaçant) a été intercepté dans le match. */
function qbIntercepted(
  ctx: ResolveContext<any, any>,
  qbPlayerId: string | undefined,
  matchId: MatchId,
  home: boolean
): boolean {
  // Règle du remplaçant : si le titulaire n'a pas lancé, prendre le QB `startedAtQB` de l'équipe.
  // TODO: résoudre le QB effectif via startedAtQB + teamId (home/away).
  if (qbPlayerId && ctx.playerStats[qbPlayerId]?.startedAtQB) {
    return (ctx.playerStats[qbPlayerId]?.passingInt ?? 0) >= 1;
  }
  const r = ctx.results[matchId];
  const teamId = home ? r?.homeTeamId : r?.awayTeamId;
  const qb = Object.values(ctx.playerStats).find(
    (p) => p.matchId === matchId && p.teamId === teamId && p.position === "QB" && p.startedAtQB
  );
  return (qb?.passingInt ?? 0) >= 1;
}

const ynMatches = (answer: "YES" | "NO", actual: boolean) =>
  (answer === "YES") === actual;

/** Équipes "bonne réponse" pour une métrique Puntos (plusieurs possibles). */
function winningTeamsForMetric(
  ctx: ResolveContext<any, any>,
  q: { metric: string; extreme: string }
): Set<TeamId> {
  // MIN_AMONG_WINNERS ne considère que les vainqueurs (« l'écart de victoire le
  // plus faible » du règlement) ; les autres extrêmes portent sur toutes les
  // équipes de la semaine.
  const pool = Object.values(ctx.teamStats).filter((t) => (q.extreme === "MIN_AMONG_WINNERS" ? t.won : true));
  const value = (t: TeamStat): number | null => {
    switch (q.metric) {
      case "TEAM_POINTS_SCORED": return t.pointsScored;
      case "TEAM_POINTS_CONCEDED": return t.pointsConceded;
      case "WINNING_MARGIN": return t.won ? t.winningMargin : null;
      default: return null;
    }
  };
  const vals = pool.map(value).filter((v): v is number => v != null);
  if (!vals.length) return new Set<TeamId>();
  const target = q.extreme === "MAX" ? Math.max(...vals) : Math.min(...vals);
  return new Set(pool.filter((t) => value(t) === target).map((t) => t.teamId));
}
