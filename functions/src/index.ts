import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { app } from "./api/app";
import { db, admin } from "./lib/firebase";
import { lockWeek } from "./scoring/lockWeek";

/**
 * Point d'entrée des Cloud Functions.
 * Toute l'API REST est servie par une seule fonction HTTP `api`.
 * Base URL après déploiement : https://<region>-<project>.cloudfunctions.net/api
 * (ou l'URL Cloud Run affichée par `firebase deploy`).
 */
export const api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    // memory: "256MiB", // ajuster si besoin
  },
  app
);

/**
 * Verrouillage automatique à l'échéance.
 *
 * Sans ce job, une deadline dépassée sans admin devant son écran laisse la
 * semaine OUVERTE : les grilles ne sont pas révélées et les retardataires
 * peuvent encore soumettre. On balaie donc toutes les ligues toutes les 5
 * minutes (requête collection group, un seul index).
 *
 * `lockWeek` est idempotent : si l'admin a déjà verrouillé à la main, la
 * semaine n'est plus OPEN et ne ressort pas de la requête.
 */
export const lockDueWeeks = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west1",
    timeZone: "Europe/Paris",
  },
  async () => {
    const dueSnap = await db
      .collectionGroup("weeks")
      .where("state", "==", "OPEN")
      .where("deadlineAt", "<=", admin.firestore.Timestamp.now())
      .get();

    if (dueSnap.empty) return;

    for (const doc of dueSnap.docs) {
      // leagues/{lid}/seasons/{sid}/weeks/{wid}
      const parts = doc.ref.path.split("/");
      const lid = parts[1];
      const sid = parts[3];
      const week = doc.data().number as number;
      if (!lid || !sid || typeof week !== "number") {
        logger.warn("Semaine à verrouiller ignorée (chemin inattendu)", { path: doc.ref.path });
        continue;
      }
      try {
        const r = await lockWeek(lid, sid, week);
        logger.info("Semaine verrouillée automatiquement", { lid, sid, week, late: r.late });
      } catch (e: any) {
        // Une ligue en erreur ne doit pas empêcher les autres d'être verrouillées.
        logger.error("Échec du verrouillage automatique", { lid, sid, week, error: e?.message });
      }
    }
  }
);
