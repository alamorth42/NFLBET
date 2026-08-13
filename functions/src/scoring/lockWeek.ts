import { db, now } from "../lib/firebase";
import { weekId, seasonPath } from "../models/types";
import { autoDrawRuntime, drawSeed } from "./draw";

/**
 * Verrouille une semaine : révélation des grilles + création des grilles
 * manquantes en LATE + tirage au sort des poules/duos. Idempotent —
 * re-verrouiller ne change rien (le tirage n'est pas rejoué).
 *
 * Extrait du handler HTTP pour être appelable aussi par le job planifié
 * `lockDueWeeks` : sans ça, une deadline dépassée sans admin devant son écran
 * laisse la semaine ouverte (grilles non révélées, retardataires acceptés).
 */
export async function lockWeek(
  lid: string,
  sid: string,
  week: number
): Promise<{ locked: boolean; late: number; drawn: string[] }> {
  const base = seasonPath(lid, sid);
  const wid = weekId(week);

  const [seasonSnap, entriesSnap, bonusesSnap] = await Promise.all([
    db.doc(base).get(),
    db.collection(`${base}/entries`).where("week", "==", week).get(),
    db.collection(`${base}/bonuses`).where("week", "==", week).get(),
  ]);
  const participants: string[] = seasonSnap.data()?.participants || [];
  const existing: Record<string, boolean> = {};
  const batch = db.batch();
  entriesSnap.forEach((d) => {
    existing[d.data().uid] = true;
    batch.set(d.ref, { weekState: "LOCKED" }, { merge: true }); // révélation
  });
  // Grilles manquantes → LATE
  let late = 0;
  for (const uid of participants) {
    if (!existing[uid]) {
      late++;
      batch.set(db.doc(`${base}/entries/${uid}_${wid}`), {
        uid,
        week,
        gamePicks: {},
        bonusAnswers: {},
        state: "LATE",
        weekState: "LOCKED",
      });
    }
  }
  // --- Tirage au sort des poules (Cage Fight) et des duos (Destins Liés) ---
  // Au verrouillage, et pas à l'ouverture : les duos à inscription volontaire
  // ont besoin des grilles rendues pour savoir qui participe. Une composition
  // déjà saisie par l'admin n'est jamais écrasée.
  const uids = Array.from(new Set([...participants, ...entriesSnap.docs.map((d) => d.data().uid as string)]));
  const drawn: string[] = [];
  for (const b of bonusesSnap.docs) {
    const data = b.data() as any;
    const answers: Record<string, any> = {};
    entriesSnap.forEach((d) => {
      const e: any = d.data();
      answers[e.uid] = (e.bonusAnswers || {})[b.id] || {};
    });
    const patch = autoDrawRuntime(
      { id: b.id, type: data.type, config: data.config, runtime: data.runtime },
      { uids, answers, seed: drawSeed(lid, sid, week, b.id) }
    );
    if (!patch) continue;
    batch.set(b.ref, { runtime: { ...(data.runtime || {}), ...patch, drawnAt: now() } }, { merge: true });
    drawn.push(data.title || data.type);
  }

  batch.set(db.doc(`${base}/weeks/${wid}`), { state: "LOCKED", lockedAt: now() }, { merge: true });
  await batch.commit();
  return { locked: true, late, drawn };
}
