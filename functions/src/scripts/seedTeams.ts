/**
 * Seed du référentiel des 32 équipes NFL dans catalog/teams.
 *
 * Usage (émulateur) :
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   export GCLOUD_PROJECT=<projectId>
 *   npm run seed:teams
 *
 * Usage (prod) :
 *   export GOOGLE_APPLICATION_CREDENTIALS=/chemin/serviceAccount.json
 *   npm run seed:teams
 */
import { db } from "../lib/firebase";
import { TEAMS } from "../data/teams";

async function main() {
  const batch = db.batch();
  for (const t of TEAMS) {
    batch.set(db.doc(`teams/${t.id}`), t, { merge: true });
  }
  await batch.commit();
  console.log(`✓ ${TEAMS.length} équipes écrites dans catalog/teams`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
