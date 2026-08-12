import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cumulativeCombo,
  duoCompetition,
  gameOfTheWeek,
  linkedParlay,
  matchTheLeader,
  periodLeader,
  playerStatPicks,
  poolCompetition,
  statLeaderboard,
  teamStatQuestions,
  teamWager,
  upset,
} from "../src/engines";
import { ctx, match, player, pts, team } from "./helpers";

/**
 * Chaque test rejoue un exemple chiffré du règlement
 * (« NFL BET RULES 2025_2026 »). Quand le règlement ne donne pas d'exemple, on
 * teste le cas limite qui fausserait un classement (égalité, retardataire,
 * absence de données).
 */

describe("PLAYER_STAT_PICKS — Trust Your WR (tout ou rien)", () => {
  const config = {
    selectionMin: 1,
    selectionMax: 3,
    entity: "PLAYER",
    statKey: "ANY_TD",
    threshold: 1,
    scoring: "GATED_EACH",
    pointsPerHit: 1,
    cap: 3,
    dedupe: "NONE",
  };
  const playerStats = [
    player("jefferson", { anyTd: 1 }),
    player("collins", { anyTd: 1 }),
    player("metcalf", { anyTd: 0 }),
  ];

  test("exemple 1 : un WR sans TD annule tout", () => {
    const r = playerStatPicks.resolve(
      ctx({ config, playerStats, entries: [{ uid: "u1", answer: { players: ["jefferson", "collins", "metcalf"] } }] })
    );
    assert.equal(pts(r, "u1"), 0);
  });

  test("exemple 2 : deux WR qui scorent = 2 points", () => {
    const r = playerStatPicks.resolve(
      ctx({ config, playerStats, entries: [{ uid: "u1", answer: { players: ["jefferson", "collins"] } }] })
    );
    assert.equal(pts(r, "u1"), 2);
  });

  test("exemple 3 : un seul WR qui score = 1 point", () => {
    const r = playerStatPicks.resolve(
      ctx({ config, playerStats, entries: [{ uid: "u1", answer: { players: ["jefferson"] } }] })
    );
    assert.equal(pts(r, "u1"), 1);
  });

  test("un WR à 2 TD ne rapporte qu'un point", () => {
    const r = playerStatPicks.resolve(
      ctx({
        config,
        playerStats: [player("jefferson", { anyTd: 2 })],
        entries: [{ uid: "u1", answer: { players: ["jefferson"] } }],
      })
    );
    assert.equal(pts(r, "u1"), 1);
  });
});

describe("PLAYER_STAT_PICKS — Choose Your Champ (élimination si partagé)", () => {
  const config = {
    selectionMin: 1,
    selectionMax: 1,
    entity: "PLAYER",
    statKey: "ANY_TD",
    threshold: 1,
    scoring: "COUNT_CAPPED",
    pointsPerHit: 1,
    cap: 3,
    dedupe: "ELIMINATE",
  };
  const playerStats = [
    player("barkley", { anyTd: 2 }),
    player("chase", { anyTd: 1 }),
    player("bowers", { anyTd: 4 }),
    player("henry", { anyTd: 1 }),
  ];

  test("exemple du règlement", () => {
    const r = playerStatPicks.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { players: ["barkley"] } },
          { uid: "u2", answer: { players: ["barkley"] } },
          { uid: "u3", answer: { players: ["henry"] } },
          { uid: "u4", answer: { players: ["bowers"] } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 0, "u1 éliminé (champion partagé)");
    assert.equal(pts(r, "u2"), 0, "u2 éliminé");
    assert.equal(pts(r, "u3"), 1);
    assert.equal(pts(r, "u4"), 3, "4 TD plafonnés à 3");
  });

  test("un retardataire n'élimine pas le champion d'un joueur à l'heure", () => {
    const r = playerStatPicks.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { players: ["bowers"] } },
          { uid: "late", answer: { players: ["bowers"] }, late: true },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 3, "le retardataire ne doit pas affecter u1");
    assert.equal(pts(r, "late"), 0, "le retardataire, lui, est éliminé");
  });
});

describe("PLAYER_STAT_PICKS — Dumpster Battle (INT du QB)", () => {
  const config = {
    selectionMin: 1,
    selectionMax: 1,
    entity: "PLAYER",
    statKey: "PASSING_INT",
    threshold: 1,
    scoring: "COUNT_CAPPED",
    pointsPerHit: 1,
    cap: 3,
    dedupe: "ELIMINATE",
  };

  test("exemple du règlement", () => {
    const r = playerStatPicks.resolve(
      ctx({
        config,
        playerStats: [
          player("darnold", { passingInt: 7 }),
          player("goff", { passingInt: 1 }),
          player("purdy", { passingInt: 8 }),
          player("lamar", { passingInt: 2 }),
        ],
        entries: [
          { uid: "u1", answer: { players: ["darnold"] } },
          { uid: "u2", answer: { players: ["darnold"] } },
          { uid: "u3", answer: { players: ["goff"] } },
          { uid: "u4", answer: { players: ["lamar"] } },
          { uid: "u5", answer: { players: ["purdy"] } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 0);
    assert.equal(pts(r, "u2"), 0);
    assert.equal(pts(r, "u3"), 1);
    assert.equal(pts(r, "u4"), 2);
    assert.equal(pts(r, "u5"), 3);
  });
});

describe("PLAYER_STAT_PICKS — National Tight End Day (3 matchs liés)", () => {
  const config = {
    selectionMin: 3,
    selectionMax: 3,
    entity: "MATCH_TE",
    statKey: "TE_TD_IN_MATCH",
    threshold: 1,
    scoring: "GATED_EACH",
    pointsPerHit: 1,
    cap: 3,
    dedupe: "NONE",
  };
  const playerStats = [
    player("te1", { matchId: "m1", position: "TE", anyTd: 1 }),
    player("te2", { matchId: "m2", position: "TE", anyTd: 2 }),
    player("te3", { matchId: "m3", position: "TE", anyTd: 0 }),
    player("wr3", { matchId: "m3", position: "WR", anyTd: 3 }),
  ];

  test("3 matchs avec TD de TE = 3 points", () => {
    const r = playerStatPicks.resolve(
      ctx({
        config,
        playerStats: [...playerStats, player("te3bis", { matchId: "m3", position: "TE", anyTd: 1 })],
        entries: [{ uid: "u1", answer: { matches: ["m1", "m2", "m3"] } }],
      })
    );
    assert.equal(pts(r, "u1"), 3);
  });

  test("un match sans TD de TE = 0 point (le TD d'un WR ne compte pas)", () => {
    const r = playerStatPicks.resolve(
      ctx({ config, playerStats, entries: [{ uid: "u1", answer: { matches: ["m1", "m2", "m3"] } }] })
    );
    assert.equal(pts(r, "u1"), 0);
  });
});

describe("STAT_LEADERBOARD — RB Death Match Duos", () => {
  const config = { selectionCount: 2, statKey: "RUSHING_YARDS", dedupe: "ELIMINATE", aggregate: "SUM", award: { "1": 3 } };
  const playerStats = [
    player("gibbs", { rushingYards: 287 }),
    player("montgomery", { rushingYards: 286 }),
    player("taylor", { rushingYards: 203 }),
    player("cook", { rushingYards: 181 }),
    player("jacobs", { rushingYards: 149 }),
    player("dowdle", { rushingYards: 88 }),
  ];

  test("exemple du règlement : le joueur 5 l'emporte avec ses deux RB", () => {
    const r = statLeaderboard.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { players: ["gibbs", "montgomery"] } },
          { uid: "u2", answer: { players: ["taylor", "montgomery"] } },
          { uid: "u3", answer: { players: ["gibbs", "taylor"] } },
          { uid: "u4", answer: { players: ["gibbs", "cook"] } },
          { uid: "u5", answer: { players: ["jacobs", "dowdle"] } },
        ],
      })
    );
    assert.equal(pts(r, "u5"), 3, "149 + 88 = 237 yds, meilleur total");
    assert.equal(pts(r, "u4"), 0, "reste Cook (181 yds)");
    assert.equal(pts(r, "u1"), 0);
    assert.equal(pts(r, "u2"), 0);
    assert.equal(pts(r, "u3"), 0);
  });

  test("si tout le monde est éliminé, personne ne marque", () => {
    const r = statLeaderboard.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { players: ["gibbs", "taylor"] } },
          { uid: "u2", answer: { players: ["gibbs", "taylor"] } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 0);
    assert.equal(pts(r, "u2"), 0);
  });
});

describe("MATCH_THE_LEADER — Kickerz", () => {
  const config = { statKey: "FG_LONGEST", solePoints: 3, sharedPoints: 1, fallbackChain: true };
  const playerStats = [
    player("bass", { fgLongest: 61, position: "K" }),
    player("tucker", { fgLongest: 55, position: "K" }),
    player("butker", { fgLongest: 48, position: "K" }),
  ];

  test("seul à nommer le bon kicker = 3 points", () => {
    const r = matchTheLeader.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { playerId: "bass" } },
          { uid: "u2", answer: { playerId: "tucker" } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 3);
    assert.equal(pts(r, "u2"), 0);
  });

  test("plusieurs à le nommer = 1 point chacun", () => {
    const r = matchTheLeader.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: { playerId: "bass" } },
          { uid: "u2", answer: { playerId: "bass" } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 1);
    assert.equal(pts(r, "u2"), 1);
  });

  test("personne sur le 1er kicker : on descend au suivant", () => {
    const r = matchTheLeader.resolve(
      ctx({ config, playerStats, entries: [{ uid: "u1", answer: { playerId: "tucker" } }] })
    );
    assert.equal(pts(r, "u1"), 3);
  });

  test("deux kickers à égalité du plus long FG : les deux sont bons", () => {
    const r = matchTheLeader.resolve(
      ctx({
        config,
        playerStats: [player("bass", { fgLongest: 61 }), player("aubrey", { fgLongest: 61 })],
        entries: [{ uid: "u1", answer: { playerId: "aubrey" } }],
      })
    );
    assert.equal(pts(r, "u1"), 3);
  });
});

describe("TEAM_WAGER — Quitte ou Double", () => {
  const config = { optional: true, soleWinPoints: 2, sharedWinPoints: 1, losePoints: -1, excludeLateFromUniqueness: true };
  const teamStats = [team("KC", { won: true }), team("BUF", { won: true }), team("NYJ", { won: false })];

  test("seul sur une équipe qui gagne = +2, partagé = +1, défaite = -1", () => {
    const r = teamWager.resolve(
      ctx({
        config,
        teamStats,
        entries: [
          { uid: "u1", answer: { teamId: "KC" } },
          { uid: "u2", answer: { teamId: "BUF" } },
          { uid: "u3", answer: { teamId: "BUF" } },
          { uid: "u4", answer: { teamId: "NYJ" } },
          { uid: "u5", answer: {} },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 2);
    assert.equal(pts(r, "u2"), 1);
    assert.equal(pts(r, "u3"), 1);
    assert.equal(pts(r, "u4"), -1);
    assert.equal(pts(r, "u5"), 0, "bonus facultatif : pas de réponse, pas de points");
  });

  test("un retardataire ne fait pas perdre l'exclusivité", () => {
    const r = teamWager.resolve(
      ctx({
        config,
        teamStats,
        entries: [
          { uid: "u1", answer: { teamId: "KC" } },
          { uid: "late", answer: { teamId: "KC" }, late: true },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 2);
  });
});

describe("UPSET", () => {
  const config = { points: 2, betOnWinless: true, betAgainstUndefeated: true };

  test("miser sur une équipe sans victoire qui gagne = +2", () => {
    const r = upset.resolve(
      ctx({
        config,
        results: [match("m1", "NYJ", "KC", 24, 20)],
        entries: [{ uid: "u1", answer: {} }],
        runtime: {
          gamePicks_u1: { m1: "NYJ" },
          preWeekRecords: { NYJ: { wins: 0, losses: 5 }, KC: { wins: 3, losses: 2 } },
        },
      })
    );
    assert.equal(pts(r, "u1"), 2);
  });

  test("miser contre une équipe invaincue qui perd = +2", () => {
    const r = upset.resolve(
      ctx({
        config,
        results: [match("m1", "NYJ", "KC", 24, 20)],
        entries: [{ uid: "u1", answer: {} }],
        runtime: {
          gamePicks_u1: { m1: "NYJ" },
          preWeekRecords: { NYJ: { wins: 2, losses: 3 }, KC: { wins: 5, losses: 0 } },
        },
      })
    );
    assert.equal(pts(r, "u1"), 2);
  });

  test("une équipe qui n'a pas encore joué n'est ni sans victoire ni invaincue", () => {
    const r = upset.resolve(
      ctx({
        config,
        results: [match("m1", "NYJ", "KC", 24, 20)],
        entries: [{ uid: "u1", answer: {} }],
        runtime: {
          gamePicks_u1: { m1: "NYJ" },
          preWeekRecords: { NYJ: { wins: 0, losses: 0 }, KC: { wins: 0, losses: 0 } },
        },
      })
    );
    assert.equal(pts(r, "u1"), 0, "semaine 1 : aucun upset possible");
  });
});

describe("CUMULATIVE_COMBO — Combinaison Parfaite", () => {
  const config = {
    cap: 3,
    items: [
      { id: "i1", matchId: "m1", qbHomePlayerId: "qbH1", qbAwayPlayerId: "qbA1", statKey: "PASSING_INT" },
      { id: "i2", matchId: "m2", qbHomePlayerId: "qbH2", qbAwayPlayerId: "qbA2", statKey: "PASSING_INT" },
      { id: "i3", matchId: "m3", qbHomePlayerId: "qbH3", qbAwayPlayerId: "qbA3", statKey: "PASSING_INT" },
    ],
  };
  const playerStats = [
    player("qbH1", { matchId: "m1", position: "QB", startedAtQB: true, passingInt: 1 }),
    player("qbA1", { matchId: "m1", position: "QB", startedAtQB: true, passingInt: 0 }),
    player("qbH2", { matchId: "m2", position: "QB", startedAtQB: true, passingInt: 0 }),
    player("qbA2", { matchId: "m2", position: "QB", startedAtQB: true, passingInt: 2 }),
    player("qbH3", { matchId: "m3", position: "QB", startedAtQB: true, passingInt: 0 }),
    player("qbA3", { matchId: "m3", position: "QB", startedAtQB: true, passingInt: 0 }),
  ];
  const answer = (a: string[][]) => ({
    items: {
      i1: { QB_HOME: a[0][0], QB_AWAY: a[0][1] },
      i2: { QB_HOME: a[1][0], QB_AWAY: a[1][1] },
      i3: { QB_HOME: a[2][0], QB_AWAY: a[2][1] },
    },
  });

  test("les 3 combinaisons bonnes = 3 points", () => {
    const r = cumulativeCombo.resolve(
      ctx({
        config,
        playerStats,
        entries: [{ uid: "u1", answer: answer([["YES", "NO"], ["NO", "YES"], ["NO", "NO"]]) }],
      })
    );
    assert.equal(pts(r, "u1"), 3);
  });

  test("le cumul s'arrête à la première erreur, dans l'ordre imposé", () => {
    const r = cumulativeCombo.resolve(
      ctx({
        config,
        playerStats,
        entries: [
          { uid: "u1", answer: answer([["YES", "NO"], ["YES", "YES"], ["NO", "NO"]]) },
          { uid: "u2", answer: answer([["NO", "NO"], ["NO", "YES"], ["NO", "NO"]]) },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 1, "match 1 bon, match 2 raté : le match 3 ne compte pas");
    assert.equal(pts(r, "u2"), 0, "match 1 raté : rien");
  });

  test("règle du remplaçant : c'est le QB qui a réellement lancé qui compte", () => {
    const r = cumulativeCombo.resolve(
      ctx({
        config: { cap: 3, items: [{ id: "i1", matchId: "m1", qbHomePlayerId: "titulaire", statKey: "PASSING_INT" }] },
        results: [match("m1", "KC", "BUF", 20, 17)],
        playerStats: [
          player("titulaire", { matchId: "m1", teamId: "KC", position: "QB", startedAtQB: false, passingInt: 0 }),
          player("remplacant", { matchId: "m1", teamId: "KC", position: "QB", startedAtQB: true, passingInt: 1 }),
          player("qbBUF", { matchId: "m1", teamId: "BUF", position: "QB", startedAtQB: true, passingInt: 0 }),
        ],
        entries: [{ uid: "u1", answer: { items: { i1: { QB_HOME: "YES", QB_AWAY: "NO" } } } }],
      })
    );
    assert.equal(pts(r, "u1"), 1);
  });
});

describe("LINKED_PARLAY — Thanksgiving Combine", () => {
  const config = { matchIds: ["m1", "m2", "m3"], allCorrectPoints: 3 };
  const results = [match("m1", "DET", "CHI", 30, 10), match("m2", "DAL", "NYG", 14, 21), match("m3", "GB", "MIA", 27, 24)];

  test("3 bons pronostics = 3 points", () => {
    const r = linkedParlay.resolve(
      ctx({ config, results, entries: [{ uid: "u1", answer: { picks: { m1: "DET", m2: "NYG", m3: "GB" } } }] })
    );
    assert.equal(pts(r, "u1"), 3);
  });

  test("un mauvais pronostic fait perdre les trois", () => {
    const r = linkedParlay.resolve(
      ctx({ config, results, entries: [{ uid: "u1", answer: { picks: { m1: "DET", m2: "DAL", m3: "GB" } } }] })
    );
    assert.equal(pts(r, "u1"), 0);
  });
});

describe("POOL_COMPETITION — Cage Fight", () => {
  const config = { poolSize: 4, firstPlacePoints: 3, tieRule: "SHARED_ZERO" };

  test("premier de poule = +3", () => {
    const r = poolCompetition.resolve(
      ctx({
        config,
        entries: [],
        weekScores: { a: 12, b: 10, c: 9, d: 8 },
        runtime: { pools: { A: ["a", "b", "c", "d"] } },
      })
    );
    assert.equal(pts(r, "a"), 3);
    assert.equal(pts(r, "b"), 0);
  });

  test("même fiche qu'un adversaire de poule = 0 point", () => {
    const r = poolCompetition.resolve(
      ctx({
        config,
        entries: [],
        weekScores: { a: 12, b: 12, c: 9, d: 8 },
        runtime: { pools: { A: ["a", "b", "c", "d"] } },
      })
    );
    assert.equal(pts(r, "a"), 0);
    assert.equal(pts(r, "b"), 0);
  });
});

describe("DUO_COMPETITION — Destins Liés", () => {
  const config = { optIn: true, rankPoints: { first: 3, second: 1, last: -1 } };

  test("+3 au premier duo, +1 au deuxième, -1 au dernier", () => {
    const r = duoCompetition.resolve(
      ctx({
        config,
        entries: [],
        weekScores: { a: 10, b: 9, c: 8, d: 7, e: 2, f: 1 },
        runtime: { duos: [["a", "b"], ["c", "d"], ["e", "f"]] },
      })
    );
    assert.equal(pts(r, "a"), 3);
    assert.equal(pts(r, "b"), 3);
    assert.equal(pts(r, "c"), 1);
    assert.equal(pts(r, "e"), -1);
  });

  test("avec deux duos seulement, le deuxième reste le deuxième", () => {
    const r = duoCompetition.resolve(
      ctx({
        config,
        entries: [],
        weekScores: { a: 10, b: 9, c: 1, d: 1 },
        runtime: { duos: [["a", "b"], ["c", "d"]] },
      })
    );
    assert.equal(pts(r, "a"), 3);
    assert.equal(pts(r, "c"), 1);
  });
});

describe("TEAM_STAT_QUESTIONS — Puntos", () => {
  const config = {
    cap: 3,
    questions: [
      { id: "q1", metric: "TEAM_POINTS_SCORED", extreme: "MAX", points: 1 },
      { id: "q2", metric: "TEAM_POINTS_CONCEDED", extreme: "MIN", points: 1 },
      { id: "q3", metric: "WINNING_MARGIN", extreme: "MIN_AMONG_WINNERS", points: 1 },
    ],
  };
  const teamStats = [
    team("KC", { pointsScored: 45, pointsConceded: 20, won: true, winningMargin: 25 }),
    team("BUF", { pointsScored: 20, pointsConceded: 3, won: true, winningMargin: 17 }),
    team("NYJ", { pointsScored: 10, pointsConceded: 9, won: true, winningMargin: 1 }),
    team("MIA", { pointsScored: 9, pointsConceded: 10, won: false, winningMargin: null }),
  ];

  test("une bonne réponse par question, plafonné à 3", () => {
    const r = teamStatQuestions.resolve(
      ctx({
        config,
        teamStats,
        entries: [
          { uid: "u1", answer: { answers: { q1: "KC", q2: "BUF", q3: "NYJ" } } },
          { uid: "u2", answer: { answers: { q1: "BUF", q2: "BUF", q3: "KC" } } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 3);
    assert.equal(pts(r, "u2"), 1);
  });

  test("le sens de la question est respecté (MAX vs MIN)", () => {
    const question = (extreme: string) => ({
      cap: 3,
      questions: [{ id: "q1", metric: "TEAM_POINTS_CONCEDED", extreme, points: 1 }],
    });
    const entries = [{ uid: "u1", answer: { answers: { q1: "KC" } } }];
    assert.equal(pts(teamStatQuestions.resolve(ctx({ config: question("MIN"), teamStats, entries })), "u1"), 0);
    assert.equal(
      pts(teamStatQuestions.resolve(ctx({ config: question("MAX"), teamStats, entries })), "u1"),
      1,
      "KC encaisse le plus de points (20)"
    );
  });

  test("plusieurs équipes peuvent être la bonne réponse", () => {
    const r = teamStatQuestions.resolve(
      ctx({
        config: { cap: 3, questions: [{ id: "q1", metric: "TEAM_POINTS_SCORED", extreme: "MAX", points: 1 }] },
        teamStats: [team("KC", { pointsScored: 30 }), team("BUF", { pointsScored: 30 })],
        entries: [
          { uid: "u1", answer: { answers: { q1: "KC" } } },
          { uid: "u2", answer: { answers: { q1: "BUF" } } },
        ],
      })
    );
    assert.equal(pts(r, "u1"), 1);
    assert.equal(pts(r, "u2"), 1);
  });
});

describe("GAME_OF_THE_WEEK", () => {
  const config = { points: 2, tieBreak: "ADMIN" };

  test("le match le plus proche du 50/50 est retenu", () => {
    const r = gameOfTheWeek.resolve(
      ctx({
        config,
        results: [match("m1", "KC", "BUF", 20, 17), match("m2", "DAL", "PHI", 10, 30)],
        entries: [
          { uid: "u1", answer: {} },
          { uid: "u2", answer: {} },
        ],
        votes: { matchVotes: { m1: { KC: 4, BUF: 0 }, m2: { DAL: 2, PHI: 2 } }, teamWagerCounts: {} },
        runtime: { gamePicks_u1: { m2: "PHI" }, gamePicks_u2: { m2: "DAL" } },
      })
    );
    assert.equal(pts(r, "u1"), 2, "PHI gagne le GOTW (m2)");
    assert.equal(pts(r, "u2"), 0);
  });

  test("l'admin peut figer le match", () => {
    const r = gameOfTheWeek.resolve(
      ctx({
        config: { ...config, gotwMatchId: "m1" },
        results: [match("m1", "KC", "BUF", 20, 17), match("m2", "DAL", "PHI", 10, 30)],
        entries: [{ uid: "u1", answer: {} }],
        votes: { matchVotes: { m1: { KC: 4, BUF: 0 }, m2: { DAL: 2, PHI: 2 } }, teamWagerCounts: {} },
        runtime: { gamePicks_u1: { m1: "KC" } },
      })
    );
    assert.equal(pts(r, "u1"), 2);
  });
});

describe("PERIOD_LEADER — WW3", () => {
  test("les leaders de la période se partagent les points", () => {
    const r = periodLeader.resolve(
      ctx({
        config: { fromWeek: 1, toWeek: 3, points: 3 },
        entries: [],
        runtime: { cumulativeScores: { a: 30, b: 30, c: 25 } },
      })
    );
    assert.equal(pts(r, "a"), 3);
    assert.equal(pts(r, "b"), 3);
    assert.equal(pts(r, "c"), 0);
  });

  test("sans score cumulé, personne n'est leader", () => {
    const r = periodLeader.resolve(ctx({ config: { fromWeek: 1, toWeek: 3, points: 3 }, entries: [], runtime: {} }));
    assert.deepEqual(r, {});
  });
});
