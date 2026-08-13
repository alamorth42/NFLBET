import { Match } from "./types";

/**
 * Bilans V-D-N des équipes, dérivés des matchs terminés.
 *
 * Rien n'est stocké : le record d'une équipe est toujours recalculé depuis les
 * résultats saisis (ou synchronisés). Il n'y a donc rien à tenir à jour d'une
 * semaine à l'autre — c'est la question la plus posée par les commissaires.
 */
export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
}

/**
 * @param beforeWeek si fourni, ne compte que les semaines strictement
 * antérieures — c'est le bilan « à l'entrée » de la semaine affichée, celui qui
 * a du sens en face d'un match pas encore joué.
 */
export function teamRecords(matches: Match[], beforeWeek?: number): Record<string, TeamRecord> {
  const rec: Record<string, TeamRecord> = {};
  const touch = (id: string) => (rec[id] ||= { wins: 0, losses: 0, ties: 0 });
  for (const m of matches) {
    if (m.status !== "FINAL" || !m.result) continue;
    if (beforeWeek !== undefined && m.week >= beforeWeek) continue;
    touch(m.homeTeamId);
    touch(m.awayTeamId);
    if (m.result.winnerTeamId === "TIE") {
      rec[m.homeTeamId].ties++;
      rec[m.awayTeamId].ties++;
      continue;
    }
    const loser = m.result.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
    rec[m.result.winnerTeamId].wins++;
    rec[loser].losses++;
  }
  return rec;
}

/** « 2-1 », « 2-1-1 » avec les nuls, « 0-0 » si l'équipe n'a pas encore joué. */
export function fmtRecord(r?: TeamRecord): string {
  if (!r) return "0-0";
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}
