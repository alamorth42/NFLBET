import { db, now } from "../lib/firebase";
import { weekId, seasonPath } from "../models/types";
import { ENGINES, pickGotwMatchId } from "../engines";

/**
 * Calcule les scores d'une semaine et met à jour le classement.
 * Idempotent : peut être rejoué après correction d'un résultat/stat.
 *
 * Pipeline :
 *  1. Charger week, matches (résultats), entries, bonuses, playerStats, rules.
 *  2. Points de base (1pt/bon prono) + Perfect Week + agrégat de votes.
 *  3. Résoudre chaque bonus via son moteur (ENGINES[type]).
 *  4. Appliquer les pénalités (retard, leak).
 *  5. Écrire scores/{uid}_Wnn + PUBLISHED + recalcul du classement.
 */
export async function scoreWeek(lid: string, sid: string, week: number) {
  const base = seasonPath(lid, sid);
  const wid = weekId(week);

  const [matchesSnap, entriesSnap, bonusesSnap, statsSnap, leagueSnap] = await Promise.all([
    db.collection(`${base}/matches`).where("week", "==", week).get(),
    db.collection(`${base}/entries`).where("week", "==", week).get(),
    db.collection(`${base}/bonuses`).where("week", "==", week).get(),
    db.collection(`${base}/playerStats`).where("week", "==", week).get(),
    db.doc(`leagues/${lid}`).get(),
  ]);

  const rules = leagueSnap.data()?.rules || {};
  const pointsPerCorrect = rules.pointsPerCorrectPick ?? 1;
  const latePenalty = rules.latePenalty ?? -3;
  const leakPenalty = rules.leakPenalty ?? -3;

  // --- Résultats + stats d'équipe (dérivées des matchs FINAL) ---
  const results: Record<string, any> = {};
  const teamStats: Record<string, any> = {};
  matchesSnap.forEach((d) => {
    const m: any = d.data();
    if (m.status !== "FINAL" || !m.result) return;
    const r = {
      matchId: d.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.result.homeScore,
      awayScore: m.result.awayScore,
      winnerTeamId: m.result.winnerTeamId,
      margin: m.result.margin,
    };
    results[d.id] = r;
    upsertTeamStat(teamStats, m.homeTeamId, week, r.homeScore, r.awayScore, r.winnerTeamId);
    upsertTeamStat(teamStats, m.awayTeamId, week, r.awayScore, r.homeScore, r.winnerTeamId);
  });

  // --- Stats joueurs (plates, source MANUAL ou PROVIDER) ---
  const playerStats: Record<string, any> = {};
  statsSnap.forEach((d) => {
    const s: any = d.data();
    playerStats[s.playerId] = s;
  });

  // --- Entries ---
  const entries = entriesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // --- Points de base + Perfect Week + votes ---
  const matchVotes: Record<string, Record<string, number>> = {};
  const perUid: Record<string, any> = {};
  for (const e of entries) {
    const picks = e.gamePicks || {};
    let correct = 0;
    let total = 0;
    for (const [mid, team] of Object.entries<any>(picks)) {
      matchVotes[mid] = matchVotes[mid] || {};
      matchVotes[mid][team] = (matchVotes[mid][team] || 0) + 1;
      const r = results[mid];
      if (r) {
        total++;
        if (r.winnerTeamId === team) correct++;
      }
    }
    perUid[e.uid] = {
      uid: e.uid,
      week,
      gamePoints: correct * pointsPerCorrect,
      correctPicks: correct,
      totalPicks: total,
      perfectWeek: false,
      bonusBreakdown: [] as any[],
      penalties: [] as any[],
      late: e.state === "LATE",
      leaked: !!e.flags?.leaked,
    };
  }

  const bonuses = bonusesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const totalMatches = Object.keys(results).length;

  // Perfect Week (si un bonus PERFECT_WEEK est actif)
  const perfect = bonuses.find((b) => b.type === "PERFECT_WEEK");
  if (perfect && totalMatches > 0) {
    const pts = perfect.config?.points ?? 10;
    for (const s of Object.values<any>(perUid)) {
      if (s.correctPicks === totalMatches && s.totalPicks === totalMatches) {
        s.perfectWeek = true;
        s.bonusBreakdown.push({ bonusId: perfect.id, type: "PERFECT_WEEK", points: pts, detail: "Perfect Week" });
      }
    }
  }

  // Score de jeu (base) — utilisé par POOL/DUO
  const weekScores: Record<string, number> = {};
  for (const s of Object.values<any>(perUid)) weekScores[s.uid] = s.gamePoints;

  const votes = { matchVotes, teamWagerCounts: {} };

  // --- Résolution des bonus ---
  for (const bonus of bonuses) {
    if (bonus.type === "PERFECT_WEEK" || bonus.type === "GAME_PICKS") continue;
    const engine = ENGINES[bonus.type];
    if (!engine) {
      console.warn(`Aucun moteur pour le type de bonus "${bonus.type}"`);
      continue;
    }

    // Injections runtime spécifiques à certains moteurs
    const runtime: any = { ...(bonus.runtime || {}) };
    for (const e of entries) runtime[`gamePicks_${e.uid}`] = e.gamePicks || {};
    if (bonus.type === "PERIOD_LEADER") {
      runtime.cumulativeScores = await cumulativeScores(base, bonus.config?.fromWeek ?? 1, bonus.config?.toWeek ?? week);
    }
    if (bonus.type === "UPSET") {
      runtime.preWeekRecords = await preWeekRecords(base, week);
    }

    const ctx = {
      bonusId: bonus.id,
      week,
      config: bonus.config || {},
      entries: entries.map((e: any) => ({
        uid: e.uid,
        answer: (e.bonusAnswers || {})[bonus.id] || {},
        late: e.state === "LATE",
      })),
      results,
      playerStats,
      teamStats,
      weekScores,
      votes,
      runtime,
    };

    let out: any = {};
    try {
      out = engine.resolve(ctx as any) || {};
    } catch (err) {
      console.error(`Moteur ${bonus.type} en échec`, err);
    }
    for (const [uid, val] of Object.entries<any>(out)) {
      if (!perUid[uid] || !val) continue;
      perUid[uid].bonusBreakdown.push({
        bonusId: bonus.id,
        type: bonus.type,
        points: val.points,
        detail: val.detail,
      });
    }
  }

  // --- Pénalités ---
  for (const s of Object.values<any>(perUid)) {
    if (s.late) s.penalties.push({ type: "LATE", points: latePenalty });
    if (s.leaked) s.penalties.push({ type: "LEAK", points: leakPenalty });
  }

  // --- Écriture des scores + PUBLISHED ---
  const batch = db.batch();
  for (const s of Object.values<any>(perUid)) {
    const bonusPts = s.bonusBreakdown.reduce((a: number, b: any) => a + (b.points || 0), 0);
    const penPts = s.penalties.reduce((a: number, b: any) => a + (b.points || 0), 0);
    s.weekTotal = s.gamePoints + bonusPts + penPts;
    s.computedAt = now();
    delete s.late;
    delete s.leaked;
    batch.set(db.doc(`${base}/scores/${s.uid}_${wid}`), s, { merge: true });
  }
  // Le GOTW est résolu ici (et pas seulement dans le moteur) pour être persisté :
  // en mode automatique il n'existe nulle part ailleurs, et l'écran de révélation
  // le lit sur la semaine.
  const gotwBonus = bonuses.find((b) => b.type === "GAME_OF_THE_WEEK");
  const weekPatch: Record<string, any> = { state: "PUBLISHED", publishedAt: now() };
  if (gotwBonus) weekPatch.gotwMatchId = pickGotwMatchId(gotwBonus.config || {}, matchVotes);
  batch.set(db.doc(`${base}/weeks/${wid}`), weekPatch, { merge: true });
  await batch.commit();

  await recomputeStandings(base);

  return { week, scored: Object.keys(perUid).length };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function upsertTeamStat(
  agg: Record<string, any>,
  teamId: string,
  week: number,
  scored: number,
  conceded: number,
  winner: string
) {
  const won = winner === teamId;
  agg[teamId] = {
    teamId,
    week,
    pointsScored: scored,
    pointsConceded: conceded,
    won,
    winningMargin: won ? Math.abs(scored - conceded) : null,
  };
}

/** Cumul des weekTotal sur [from, to] (pour PERIOD_LEADER). */
async function cumulativeScores(base: string, from: number, to: number) {
  const out: Record<string, number> = {};
  for (let w = from; w <= to; w++) {
    const snap = await db.collection(`${base}/scores`).where("week", "==", w).get();
    snap.forEach((d) => {
      const s: any = d.data();
      out[s.uid] = (out[s.uid] || 0) + (s.weekTotal || 0);
    });
  }
  return out;
}

/** Bilans V/D des équipes AVANT la semaine (pour UPSET). */
async function preWeekRecords(base: string, week: number) {
  const rec: Record<string, { wins: number; losses: number }> = {};
  const snap = await db.collection(`${base}/matches`).where("week", "<", week).get();
  snap.forEach((d) => {
    const m: any = d.data();
    if (m.status !== "FINAL" || !m.result) return;
    for (const t of [m.homeTeamId, m.awayTeamId]) rec[t] = rec[t] || { wins: 0, losses: 0 };
    const w = m.result.winnerTeamId;
    if (w === "TIE") return;
    rec[w].wins++;
    const loser = w === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
    rec[loser].losses++;
  });
  return rec;
}

/** Recalcule tout le classement de la saison à partir des scores. */
async function recomputeStandings(base: string) {
  const snap = await db.collection(`${base}/scores`).get();
  const totals: Record<string, number> = {};
  const perWeek: Record<string, Record<string, number>> = {};
  snap.forEach((d) => {
    const s: any = d.data();
    totals[s.uid] = (totals[s.uid] || 0) + (s.weekTotal || 0);
    perWeek[s.uid] = perWeek[s.uid] || {};
    perWeek[s.uid][weekId(s.week)] = s.weekTotal;
  });
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const batch = db.batch();
  ranked.forEach(([uid, total], i) => {
    batch.set(
      db.doc(`${base}/standings/${uid}`),
      { uid, totalPoints: total, rank: i + 1, perWeek: perWeek[uid], updatedAt: now() },
      { merge: true }
    );
  });
  await batch.commit();
}
