import express, { NextFunction, Response } from "express";
import cors from "cors";
import { db, now, admin } from "../lib/firebase";
import { AuthedRequest, verifyAuth, requireMember, requireAdmin } from "../lib/auth";
import { ApiError, badRequest, notFound } from "../lib/errors";
import { weekId, seasonPath } from "../models/types";
import { ENGINES } from "../engines";
import { ENGINE_CATALOG } from "./catalog";
import { fetchNflWeek, fetchNflResults } from "./schedule";
import { computeStatTodo } from "../scoring/statTodo";
import { scoreWeek } from "../scoring/scoreWeek";
import { lockWeek } from "../scoring/lockWeek";
import { collectEntryRefs } from "../lib/refs";

export const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/** Renvoie les chemins de documents qui n'existent pas (parmi ceux fournis). */
async function findMissing(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const snaps = await db.getAll(...paths.map((p) => db.doc(p)));
  return snaps.filter((s) => !s.exists).map((s) => s.ref.path);
}

/**
 * Code d'invitation : 6 caractères sans les ambigus (0/O, 1/I/L) pour rester
 * dictable à l'oral. L'index `inviteCodes/{code}` permet de retrouver la ligue
 * sans requête (le client n'a pas le droit de lister les ligues).
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeInviteCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

/** Réserve un code libre et renvoie sa référence d'index. */
async function reserveInviteCode(leagueId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const ref = db.doc(`inviteCodes/${code}`);
    if ((await ref.get()).exists) continue;
    await ref.set({ leagueId, createdAt: now() });
    return code;
  }
  throw new ApiError(500, "CODE_GENERATION_FAILED", "Impossible de générer un code d'invitation");
}

/** Wrapper async → propage les erreurs vers le handler d'erreur. */
const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>) =>
  (req: AuthedRequest, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Toutes les routes exigent un utilisateur authentifié.
app.use(verifyAuth);

/* ================================================================
 * Catalogue des moteurs
 * ================================================================ */
app.get(
  "/config/engines",
  wrap(async (_req, res) => {
    res.json({ data: ENGINE_CATALOG });
  })
);

/**
 * Calendrier NFL d'une semaine (lecture seule, provider public).
 * Utilisé par la console admin pour pré-remplir la création des matchs.
 */
app.get(
  "/nfl/schedule",
  wrap(async (req, res) => {
    const season = parseInt(String(req.query.season || ""), 10);
    const week = parseInt(String(req.query.week || ""), 10);
    if (!season || season < 2000 || season > 2100) throw badRequest("INVALID_SEASON", "season (année) requis");
    if (!week || week < 1 || week > 18) throw badRequest("INVALID_WEEK", "week entre 1 et 18 requis");
    const matches = await fetchNflWeek(season, week);
    res.json({ data: { season, week, matches } });
  })
);

/**
 * Mes ligues. Le front n'a pas le droit de lister `leagues` (règles Firestore),
 * on passe donc par une requête collection group sur les documents `members`.
 *
 * `?also=lid1,lid2` : ids connus du client (localStorage des versions
 * précédentes). Les membres correspondants sont ré-estampillés avec leur `uid`
 * pour entrer dans l'index — sans ça, une ligue créée avant cette version
 * resterait invisible depuis un autre navigateur.
 */
app.get(
  "/me/leagues",
  wrap(async (req, res) => {
    const uid = req.uid!;

    const also = String(req.query.also || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (also.length) {
      const snaps = await db.getAll(...also.map((lid) => db.doc(`leagues/${lid}/members/${uid}`)));
      const backfill = snaps.filter((s) => s.exists && !s.data()?.uid);
      await Promise.all(backfill.map((s) => s.ref.set({ uid }, { merge: true })));
    }

    const membersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
    const rows = membersSnap.docs
      .filter((d) => d.data().status !== "REMOVED")
      .map((d) => ({ lid: d.ref.path.split("/")[1], role: d.data().role as string }));

    const leagues = rows.length ? await db.getAll(...rows.map((r) => db.doc(`leagues/${r.lid}`))) : [];
    const data = rows
      .map((r, i) => ({
        id: r.lid,
        name: (leagues[i]?.exists && (leagues[i].data()?.name as string)) || r.lid,
        role: r.role,
      }))
      .filter((l) => leagues.find((s) => s.id === l.id)?.exists);

    res.json({ data: { leagues: data } });
  })
);

/* ================================================================
 * Ligues & saisons
 * ================================================================ */
app.post(
  "/leagues",
  wrap(async (req, res) => {
    const uid = req.uid!;
    const { name, timezone = "Europe/Paris", displayName } = req.body || {};
    if (!name) throw badRequest("MISSING_NAME", "name requis");
    const ref = db.collection("leagues").doc();
    const batch = db.batch();
    batch.set(ref, {
      name,
      sport: "NFL",
      ownerUid: uid,
      timezone,
      plan: "FREE",
      rules: {
        pointsPerCorrectPick: 1,
        latePenalty: -3,
        leakPenalty: -3,
        revealPolicy: "ON_LOCK",
        lockPolicy: "FIXED_DEADLINE",
      },
      createdAt: now(),
    });
    batch.set(ref.collection("members").doc(uid), {
      uid,
      displayName: displayName || "Owner",
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: now(),
    });
    await batch.commit();
    const inviteCode = await reserveInviteCode(ref.id);
    await ref.set({ inviteCode }, { merge: true });
    res.json({ data: { leagueId: ref.id, inviteCode } });
  })
);

/** Admin : (re)génère le code d'invitation. L'ancien code cesse de fonctionner. */
app.post(
  "/leagues/:lid/invite-code",
  wrap(async (req, res) => {
    const { lid } = req.params;
    await requireAdmin(lid, req.uid!);
    const snap = await db.doc(`leagues/${lid}`).get();
    const previous = snap.data()?.inviteCode;
    const inviteCode = await reserveInviteCode(lid);
    await db.doc(`leagues/${lid}`).set({ inviteCode }, { merge: true });
    if (previous) await db.doc(`inviteCodes/${previous}`).delete().catch(() => undefined);
    res.json({ data: { inviteCode } });
  })
);

/** Rejoindre une ligue via son code d'invitation (flux public d'onboarding). */
app.post(
  "/invites/:code/accept",
  wrap(async (req, res) => {
    const code = String(req.params.code || "").toUpperCase();
    const uid = req.uid!;
    const { displayName } = req.body || {};
    const idx = await db.doc(`inviteCodes/${code}`).get();
    if (!idx.exists) throw badRequest("INVALID_INVITE_CODE", "Code d'invitation inconnu ou expiré");
    const lid = idx.data()!.leagueId as string;
    const league = await db.doc(`leagues/${lid}`).get();
    if (!league.exists) throw notFound("Ligue introuvable");
    await db.doc(`leagues/${lid}/members/${uid}`).set(
      { uid, displayName: displayName || "Joueur", role: "PLAYER", status: "ACTIVE", joinedAt: now() },
      { merge: true }
    );
    res.json({ data: { leagueId: lid, name: league.data()?.name } });
  })
);

app.post(
  "/leagues/:lid/seasons",
  wrap(async (req, res) => {
    const { lid } = req.params;
    await requireAdmin(lid, req.uid!);
    const { name, startWeek = 1, endWeek = 18 } = req.body || {};
    const ref = db.collection(`leagues/${lid}/seasons`).doc();
    await ref.set({ name, startWeek, endWeek, status: "ACTIVE", participants: [], createdAt: now() });
    res.json({ data: { seasonId: ref.id } });
  })
);

/** Rejoindre une ligue (crée le membre PLAYER). */
app.post(
  "/leagues/:lid/join",
  wrap(async (req, res) => {
    const { lid } = req.params;
    const uid = req.uid!;
    const { displayName } = req.body || {};
    await db.doc(`leagues/${lid}/members/${uid}`).set(
      { uid, displayName: displayName || "Joueur", role: "PLAYER", status: "ACTIVE", joinedAt: now() },
      { merge: true }
    );
    res.json({ data: { joined: true } });
  })
);

/** Admin : ajoute un participant à une saison (nécessaire au lock pour les retards). */
app.post(
  "/leagues/:lid/seasons/:sid/participants",
  wrap(async (req, res) => {
    const { lid, sid } = req.params;
    await requireAdmin(lid, req.uid!);
    const { uid } = req.body || {};
    if (!uid) throw badRequest("MISSING_UID");
    await db.doc(seasonPath(lid, sid)).set(
      { participants: admin.firestore.FieldValue.arrayUnion(uid) },
      { merge: true }
    );
    res.json({ data: { added: uid } });
  })
);

/* ================================================================
 * Semaines & matchs (admin)
 * ================================================================ */
app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/matches",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const matches = req.body?.matches || [];

    // Import du calendrier = geste répétable : on ignore les affiches déjà
    // créées pour la semaine plutôt que de dupliquer (les bonus pointent
    // sur des matchId, un doublon fausserait la grille).
    const existing = await db.collection(`${base}/matches`).where("week", "==", week).get();
    const seen = new Set(existing.docs.map((d) => `${d.data().awayTeamId}@${d.data().homeTeamId}`));

    const batch = db.batch();
    batch.set(db.doc(`${base}/weeks/${weekId(week)}`), { number: week, state: "UPCOMING" }, { merge: true });
    const created: string[] = [];
    const skipped: string[] = [];
    for (const m of matches) {
      if (!m?.homeTeamId || !m?.awayTeamId) throw badRequest("INVALID_MATCH", "homeTeamId et awayTeamId requis");
      if (m.homeTeamId === m.awayTeamId) throw badRequest("INVALID_MATCH", `Équipe en double : ${m.homeTeamId}`);
      const key = `${m.awayTeamId}@${m.homeTeamId}`;
      if (seen.has(key)) {
        skipped.push(key);
        continue;
      }
      seen.add(key);
      const ref = db.collection(`${base}/matches`).doc();
      batch.set(ref, {
        week,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt ? admin.firestore.Timestamp.fromMillis(new Date(m.kickoffAt).getTime()) : null,
        externalId: m.externalId || null,
        status: "SCHEDULED",
        source: m.externalId ? "PROVIDER" : "MANUAL",
      });
      created.push(ref.id);
    }
    await batch.commit();
    res.json({ data: { created, skipped } });
  })
);

/** Ouvrir la semaine à la saisie des joueurs. */
app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/open",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const { deadlineAt, formOpenAt } = req.body || {};
    await db.doc(`${base}/weeks/${weekId(week)}`).set(
      {
        number: week,
        state: "OPEN",
        formOpenAt: formOpenAt ? admin.firestore.Timestamp.fromMillis(new Date(formOpenAt).getTime()) : now(),
        deadlineAt: deadlineAt ? admin.firestore.Timestamp.fromMillis(new Date(deadlineAt).getTime()) : null,
      },
      { merge: true }
    );
    res.json({ data: { state: "OPEN" } });
  })
);

app.put(
  "/leagues/:lid/seasons/:sid/matches/:mid/result",
  wrap(async (req, res) => {
    const { lid, sid, mid } = req.params;
    await requireAdmin(lid, req.uid!);
    const base = seasonPath(lid, sid);
    const { homeScore, awayScore } = req.body || {};
    if (typeof homeScore !== "number" || typeof awayScore !== "number")
      throw badRequest("INVALID_SCORE", "homeScore/awayScore numériques requis");
    const ref = db.doc(`${base}/matches/${mid}`);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Match introuvable");
    const m: any = snap.data();
    const winner = homeScore === awayScore ? "TIE" : homeScore > awayScore ? m.homeTeamId : m.awayTeamId;
    await ref.set(
      {
        status: "FINAL",
        result: { homeScore, awayScore, winnerTeamId: winner, margin: Math.abs(homeScore - awayScore) },
        source: "MANUAL",
      },
      { merge: true }
    );
    res.json({ data: { winnerTeamId: winner } });
  })
);

/**
 * Synchronise les scores d'une semaine depuis le provider public.
 * Ne touche qu'aux matchs terminés ; un résultat déjà saisi à la main n'est
 * jamais écrasé (l'admin fait foi, cf. §6.4 de l'archi).
 */
app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/sync-results",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const season = parseInt(String(req.body?.season || ""), 10);
    if (!season || season < 2000 || season > 2100) throw badRequest("INVALID_SEASON", "season (année) requis");

    const feed = await fetchNflResults(season, week);
    const byExternal: Record<string, any> = {};
    const byPair: Record<string, any> = {};
    for (const f of feed) {
      if (f.externalId) byExternal[f.externalId] = f;
      if (f.awayTeamId && f.homeTeamId) byPair[`${f.awayTeamId}@${f.homeTeamId}`] = f;
    }

    const snap = await db.collection(`${base}/matches`).where("week", "==", week).get();
    const batch = db.batch();
    const updated: string[] = [];
    const skipped: string[] = [];
    for (const d of snap.docs) {
      const m: any = d.data();
      const pair = `${m.awayTeamId}@${m.homeTeamId}`;
      const f = (m.externalId && byExternal[m.externalId]) || byPair[pair];
      if (!f || !f.final || f.homeScore === null || f.awayScore === null) {
        skipped.push(pair);
        continue;
      }
      // Correction manuelle déjà en place → on ne l'écrase pas.
      if (m.status === "FINAL" && m.source === "MANUAL") {
        skipped.push(pair);
        continue;
      }
      const winner =
        f.homeScore === f.awayScore ? "TIE" : f.homeScore > f.awayScore ? m.homeTeamId : m.awayTeamId;
      batch.set(
        d.ref,
        {
          status: "FINAL",
          result: {
            homeScore: f.homeScore,
            awayScore: f.awayScore,
            winnerTeamId: winner,
            margin: Math.abs(f.homeScore - f.awayScore),
          },
          externalId: m.externalId || f.externalId || null,
          source: "PROVIDER",
        },
        { merge: true }
      );
      updated.push(pair);
    }
    await batch.commit();
    res.json({ data: { updated, skipped } });
  })
);

/** Admin : supprimer un match (import raté). Interdit une fois la semaine verrouillée. */
app.delete(
  "/leagues/:lid/seasons/:sid/matches/:mid",
  wrap(async (req, res) => {
    const { lid, sid, mid } = req.params;
    await requireAdmin(lid, req.uid!);
    const base = seasonPath(lid, sid);
    const ref = db.doc(`${base}/matches/${mid}`);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Match introuvable");
    const week = snap.data()!.week as number;

    const weekSnap = await db.doc(`${base}/weeks/${weekId(week)}`).get();
    const state = weekSnap.data()?.state;
    if (state && state !== "UPCOMING" && state !== "OPEN")
      throw badRequest("WEEK_LOCKED", "Semaine verrouillée : supprimer un match fausserait les grilles déjà jouées.");

    // Un bonus qui cite ce match (parlay, combo, TE day) deviendrait insoluble.
    const bonuses = await db.collection(`${base}/bonuses`).where("week", "==", week).get();
    const used = bonuses.docs.filter((b) => JSON.stringify(b.data().config ?? {}).includes(mid));
    if (used.length)
      throw badRequest(
        "MATCH_IN_USE",
        `Match utilisé par ${used.length} bonus (${used.map((b) => b.data().title).join(", ")}). Supprime le bonus d'abord.`
      );

    await ref.delete();
    res.json({ data: { deleted: mid } });
  })
);

/* ================================================================
 * Bonus (admin)
 * ================================================================ */
app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/bonuses",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const { type, title, config = {}, optional = false, runtime = {} } = req.body || {};
    if (!type) throw badRequest("MISSING_TYPE");
    const engine = ENGINES[type];
    if (engine?.configSchema) {
      const parsed = engine.configSchema.safeParse(config);
      if (!parsed.success) throw badRequest("INVALID_CONFIG", parsed.error.message);
    }
    const ref = db.collection(`${base}/bonuses`).doc();
    await ref.set({ week, type, title: title || type, config, optional, runtime, state: "ACTIVE" });
    await db.doc(`${base}/weeks/${weekId(week)}`).set(
      { bonusIds: admin.firestore.FieldValue.arrayUnion(ref.id) },
      { merge: true }
    );
    res.json({ data: { bonusId: ref.id } });
  })
);

/** Admin : supprimer un bonus mal configuré. */
app.delete(
  "/leagues/:lid/seasons/:sid/bonuses/:bid",
  wrap(async (req, res) => {
    const { lid, sid, bid } = req.params;
    await requireAdmin(lid, req.uid!);
    const base = seasonPath(lid, sid);
    const ref = db.doc(`${base}/bonuses/${bid}`);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Bonus introuvable");
    const week = snap.data()!.week as number;

    const weekSnap = await db.doc(`${base}/weeks/${weekId(week)}`).get();
    const state = weekSnap.data()?.state;

    const batch = db.batch();
    batch.delete(ref);
    batch.set(
      db.doc(`${base}/weeks/${weekId(week)}`),
      { bonusIds: admin.firestore.FieldValue.arrayRemove(bid) },
      { merge: true }
    );
    await batch.commit();
    // Les réponses déjà saisies pour ce bonus restent dans les grilles mais ne
    // sont plus lues : le scoring itère sur les bonus existants.
    res.json({ data: { deleted: bid, rescoreNeeded: state === "PUBLISHED" || state === "SCORING" } });
  })
);

/* ================================================================
 * Grilles (joueur)
 * ================================================================ */
app.put(
  "/leagues/:lid/seasons/:sid/entries/:w",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    const uid = req.uid!;
    await requireMember(lid, uid);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const wid = weekId(week);

    const weekSnap = await db.doc(`${base}/weeks/${wid}`).get();
    if (!weekSnap.exists) throw notFound("Semaine introuvable");
    const wd: any = weekSnap.data();
    if (wd.state !== "OPEN") throw badRequest("WEEK_LOCKED", "La semaine n'est pas ouverte");

    const { gamePicks = {}, bonusAnswers = {} } = req.body || {};

    // Validation des réponses bonus via le answerSchema de chaque moteur
    const bonusesSnap = await db.collection(`${base}/bonuses`).where("week", "==", week).get();
    const byId: Record<string, any> = {};
    bonusesSnap.forEach((d) => (byId[d.id] = d.data()));
    for (const [bid, ans] of Object.entries(bonusAnswers)) {
      const b = byId[bid];
      if (!b) continue;
      const engine = ENGINES[b.type];
      if (!engine?.answerSchema) continue;
      const parsed = engine.answerSchema.safeParse(ans);
      if (!parsed.success) throw badRequest("INVALID_BONUS_ANSWER", `Bonus ${bid}: ${parsed.error.message}`);
    }

    // Validation des références : les joueurs/équipes doivent exister dans le référentiel.
    const { playerIds, teamIds } = collectEntryRefs(byId, bonusAnswers);
    const missing = await findMissing([
      ...playerIds.map((id) => `players/${id}`),
      ...teamIds.map((id) => `teams/${id}`),
    ]);
    if (missing.length) throw badRequest("INVALID_REFERENCE", `Références inconnues: ${missing.join(", ")}`);

    const ts = now();
    const late = wd.deadlineAt && ts.toMillis() > wd.deadlineAt.toMillis();
    await db.doc(`${base}/entries/${uid}_${wid}`).set(
      {
        uid,
        week,
        gamePicks,
        bonusAnswers,
        state: late ? "LATE" : "SUBMITTED",
        submittedAt: ts,
        weekState: wd.state,
      },
      { merge: true }
    );
    res.json({ data: { state: late ? "LATE" : "SUBMITTED" } });
  })
);

/* ================================================================
 * Lock / stats / scoring (admin)
 * ================================================================ */
app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/lock",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const r = await lockWeek(lid, sid, parseInt(w, 10));
    res.json({ data: r });
  })
);

/** Mode manuel v1 : liste des stats à saisir (entités réellement sélectionnées). */
app.get(
  "/leagues/:lid/seasons/:sid/weeks/:w/stat-todo",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const [bonusesSnap, entriesSnap] = await Promise.all([
      db.collection(`${base}/bonuses`).where("week", "==", week).get(),
      db.collection(`${base}/entries`).where("week", "==", week).get(),
    ]);
    const bonuses = bonusesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const entries = entriesSnap.docs.map((d) => d.data() as any);
    res.json({ data: computeStatTodo(bonuses, entries) });
  })
);

/** Mode manuel v1 : saisie des stats joueurs. */
app.put(
  "/leagues/:lid/seasons/:sid/weeks/:w/stats-override",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const week = parseInt(w, 10);
    const base = seasonPath(lid, sid);
    const wid = weekId(week);
    const stats = req.body?.stats || [];

    // Pré-remplissage teamId/position depuis catalog/players (l'admin ne saisit que la stat).
    const catalog: Record<string, any> = {};
    const withId = stats.filter((s: any) => s.playerId);
    if (withId.length) {
      const snaps = await db.getAll(...withId.map((s: any) => db.doc(`players/${s.playerId}`)));
      snaps.forEach((snap) => {
        if (snap.exists) catalog[snap.id] = snap.data();
      });
    }

    const batch = db.batch();
    for (const s of stats) {
      if (!s.playerId) continue;
      const cat = catalog[s.playerId] || {};
      batch.set(
        db.doc(`${base}/playerStats/${s.playerId}_${wid}`),
        {
          playerId: s.playerId,
          teamId: s.teamId ?? cat.teamId ?? null,
          matchId: s.matchId || null,
          week,
          position: s.position ?? cat.position ?? "OTHER",
          startedAtQB: !!s.startedAtQB,
          anyTd: s.anyTd || 0,
          receivingTd: s.receivingTd || 0,
          rushingTd: s.rushingTd || 0,
          rushingYards: s.rushingYards || 0,
          passingInt: s.passingInt || 0,
          fgLongest: s.fgLongest ?? null,
          source: "MANUAL",
        },
        { merge: true }
      );
    }
    await batch.commit();
    res.json({ data: { saved: stats.length } });
  })
);

app.post(
  "/leagues/:lid/seasons/:sid/weeks/:w/score",
  wrap(async (req, res) => {
    const { lid, sid, w } = req.params;
    await requireAdmin(lid, req.uid!);
    const result = await scoreWeek(lid, sid, parseInt(w, 10));
    res.json({ data: result });
  })
);

/* ================================================================
 * Handler d'erreur
 * ================================================================ */
app.use((err: any, _req: AuthedRequest, res: Response, _next: NextFunction) => {
  const status = err instanceof ApiError ? err.status : 500;
  const code = err instanceof ApiError ? err.code : "INTERNAL";
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code, message: err?.message || "Erreur interne" } });
});
