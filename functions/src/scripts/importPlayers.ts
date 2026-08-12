/**
 * Import du référentiel des joueurs dans catalog/players depuis un CSV.
 *
 * Colonnes attendues (en-tête requis) :
 *   id,firstName,lastName,teamId,position,externalId
 *   - `id`         : ID de document souhaité (facultatif). PRIORITAIRE s'il est fourni.
 *   - `externalId` : clé provider (API-Sports…). Si `id` absent, l'ID = `p_<externalId>`.
 *   - sinon (ni id ni externalId) : ID généré `p_<prenom>_<nom>` (fragile — à éviter en prod).
 *
 * L'ID du document (`playerId`) est ce qui voyage partout (grilles, stats, scoring).
 * ➜ Recommandé : aligner `id`/`externalId` sur l'ID API-Sports dès maintenant.
 *
 * Usage :
 *   export GOOGLE_APPLICATION_CREDENTIALS=/chemin/serviceAccount.json   # ou FIRESTORE_EMULATOR_HOST
 *   npm run import:players -- ./players.csv
 */
import * as fs from "fs";
import { db } from "../lib/firebase";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += c;
      } else if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuotes = true;
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (cells[i] ?? "").trim()));
    return o;
  });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage : npm run import:players -- <chemin/players.csv>");
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(path, "utf8"));
  let batch = db.batch();
  let inBatch = 0;
  let total = 0;

  for (const r of rows) {
    const id =
      (r.id && r.id.trim()) ||
      (r.externalId && r.externalId.trim() ? `p_${r.externalId.trim()}` : `p_${slug(`${r.firstName}_${r.lastName}`)}`);

    batch.set(
      db.doc(`players/${id}`),
      {
        displayName: `${r.firstName} ${r.lastName}`.trim(),
        firstName: r.firstName || "",
        lastName: r.lastName || "",
        teamId: r.teamId || null,
        position: r.position || "OTHER",
        externalId: r.externalId || null,
        active: true,
      },
      { merge: true }
    );

    inBatch++;
    total++;
    if (inBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  console.log(`✓ ${total} joueurs importés dans catalog/players`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
