import { Bonus, Match } from "./types";

/**
 * Validation de la grille AVANT envoi.
 *
 * Le back re-valide tout (answerSchema Zod de chaque moteur) et c'est lui qui
 * fait foi ; ici on reproduit les mêmes contraintes uniquement pour dire au
 * joueur CE QUI manque, au lieu de l'« INVALID_BONUS_ANSWER » générique.
 * Les règles ci-dessous suivent les answerSchema de functions/src/engines.
 */
export interface Problem {
  /** id du bonus concerné, ou "matches" pour la section pronos. */
  scope: string;
  message: string;
}

export function validateEntry({
  matches,
  picks,
  bonuses,
  answers,
}: {
  matches: Match[];
  picks: Record<string, string>;
  bonuses: Bonus[];
  answers: Record<string, any>;
}): Problem[] {
  const problems: Problem[] = [];

  const missing = matches.filter((m) => !picks[m.id]);
  if (missing.length) {
    problems.push({
      scope: "matches",
      message:
        missing.length === matches.length
          ? "Aucun match pronostiqué."
          : `${missing.length} match${missing.length > 1 ? "s" : ""} sans pronostic (${missing
              .slice(0, 3)
              .map((m) => `${m.awayTeamId}@${m.homeTeamId}`)
              .join(", ")}${missing.length > 3 ? "…" : ""}).`,
    });
  }

  for (const b of bonuses) {
    const a = answers[b.id];
    const cfg = b.config || {};
    const add = (message: string) => problems.push({ scope: b.id, message: `${b.title} : ${message}` });
    // Un bonus optionnel laissé entièrement vide est accepté.
    const untouched = a === undefined || a === null || Object.keys(a).length === 0;
    if (b.optional && untouched) continue;

    switch (b.type) {
      case "PLAYER_STAT_PICKS": {
        if (cfg.entity === "MATCH_TE") {
          const list: string[] = a?.matches || [];
          if (list.length !== 3) add(`sélectionne exactement 3 matchs (${list.length} pour l'instant).`);
        } else {
          const list: string[] = a?.players || [];
          const min = cfg.selectionMin ?? 1;
          const max = cfg.selectionMax ?? 3;
          if (list.length < min || list.length > max) {
            add(
              min === max
                ? `sélectionne exactement ${min} joueur${min > 1 ? "s" : ""} (${list.length} pour l'instant).`
                : `sélectionne entre ${min} et ${max} joueurs (${list.length} pour l'instant).`
            );
          }
          if (new Set(list).size !== list.length) add("un joueur est sélectionné deux fois.");
        }
        break;
      }
      case "STAT_LEADERBOARD": {
        const list: string[] = a?.players || [];
        const count = cfg.selectionCount ?? 2;
        if (list.length !== count) add(`sélectionne exactement ${count} joueurs (${list.length} pour l'instant).`);
        if (new Set(list).size !== list.length) add("un joueur est sélectionné deux fois.");
        break;
      }
      case "MATCH_THE_LEADER":
        if (!a?.playerId) add("choisis un joueur.");
        break;
      case "TEAM_WAGER":
        if (!a?.teamId && !cfg.optional) add("choisis une équipe.");
        break;
      case "TEAM_STAT_QUESTIONS": {
        const qs: any[] = cfg.questions || [];
        const given = a?.answers || {};
        const blanks = qs.filter((q) => !given[q.id]);
        if (blanks.length) add(`${blanks.length} question${blanks.length > 1 ? "s" : ""} sans réponse.`);
        break;
      }
      case "LINKED_PARLAY": {
        const ids: string[] = cfg.matchIds || [];
        const given = a?.picks || {};
        const blanks = ids.filter((id) => !given[id]);
        if (blanks.length) add(`${blanks.length} match${blanks.length > 1 ? "s" : ""} du combiné sans pronostic.`);
        break;
      }
      case "CUMULATIVE_COMBO": {
        const items: any[] = cfg.items || [];
        const given = a?.items || {};
        const blanks = items.filter((it) => !given[it.id]?.QB_HOME || !given[it.id]?.QB_AWAY);
        if (blanks.length) add(`${blanks.length} match${blanks.length > 1 ? "s" : ""} sans OUI/NON complet.`);
        break;
      }
      // DUO_COMPETITION : `participate` absent = ne participe pas, c'est valide.
      // Bonus automatiques (PERFECT_WEEK, GAME_OF_THE_WEEK, PERIOD_LEADER,
      // UPSET, POOL_COMPETITION) : aucune saisie attendue.
      default:
        break;
    }
  }

  return problems;
}
