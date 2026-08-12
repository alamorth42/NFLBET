import { db, now } from "../lib/firebase";
import { weekId, seasonPath } from "../models/types";

/**
 * Verrouille une semaine : révélation des grilles + création des grilles
 * manquantes en LATE. Idempotent — re-verrouiller ne change rien.
 *
 * Extrait du handler HTTP pour être appelable aussi par le job planifié
 * `lockDueWeeks` : sans ça, une deadline dépassée sans admin devant son écran
 * laisse la semaine ouverte (grilles non révélées, retardataires acceptés).
 */
export async function lockWeek(lid: string, sid: string, week: number): Promise<{ locked: boolean; late: number }> {
  const base = seasonPath(lid, sid);
  const wid = weekId(week);

  const seasonSnap = await db.doc(base).get();
  const participants: string[] = seasonSnap.data()?.participants || [];
  const entriesSnap = await db.collection(`${base}/entries`).where("week", "==", week).get();
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
  batch.set(db.doc(`${base}/weeks/${wid}`), { state: "LOCKED", lockedAt: now() }, { merge: true });
  await batch.commit();
  return { locked: true, late };
}
