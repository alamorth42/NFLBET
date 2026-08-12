/**
 * Mode manuel v1 : calcule EXACTEMENT les stats que l'admin doit saisir,
 * à partir des entités réellement sélectionnées par les participants.
 * Renvoie une liste de cases { entityType, entityId, statKey, label }.
 */
export function computeStatTodo(
  bonuses: Array<{ id: string; type: string; config?: any }>,
  entries: Array<{ bonusAnswers?: Record<string, any> }>
) {
  const todos: Record<string, any> = {};
  const add = (t: any) => {
    todos[`${t.entityType}:${t.entityId}:${t.statKey}`] = t;
  };

  for (const b of bonuses) {
    const answers = entries.map((e) => (e.bonusAnswers || {})[b.id]).filter(Boolean);

    switch (b.type) {
      case "PLAYER_STAT_PICKS":
        if (b.config?.entity === "MATCH_TE") {
          answers.forEach((a: any) =>
            (a.matches || []).forEach((mid: string) =>
              add({ entityType: "MATCH_TE", entityId: mid, statKey: "TE_TD_IN_MATCH", label: `Un TE a-t-il marqué dans ${mid} ?` })
            )
          );
        } else {
          const stat = b.config?.statKey || "ANY_TD";
          answers.forEach((a: any) =>
            (a.players || []).forEach((pid: string) =>
              add({ entityType: "PLAYER", entityId: pid, statKey: stat, label: `${stat} de ${pid}` })
            )
          );
        }
        break;

      case "STAT_LEADERBOARD": {
        const stat = b.config?.statKey || "RUSHING_YARDS";
        answers.forEach((a: any) =>
          (a.players || []).forEach((pid: string) =>
            add({ entityType: "PLAYER", entityId: pid, statKey: stat, label: `${stat} de ${pid}` })
          )
        );
        break;
      }

      case "MATCH_THE_LEADER":
        answers.forEach(
          (a: any) => a.playerId && add({ entityType: "PLAYER", entityId: a.playerId, statKey: "FG_LONGEST", label: `Plus long FG de ${a.playerId}` })
        );
        break;

      case "CUMULATIVE_COMBO":
        (b.config?.items || []).forEach((it: any) => {
          if (it.qbHomePlayerId)
            add({ entityType: "PLAYER", entityId: it.qbHomePlayerId, statKey: "PASSING_INT", label: `INT de ${it.qbHomePlayerId}` });
          if (it.qbAwayPlayerId)
            add({ entityType: "PLAYER", entityId: it.qbAwayPlayerId, statKey: "PASSING_INT", label: `INT de ${it.qbAwayPlayerId}` });
        });
        break;

      default:
        // Les autres moteurs n'ont besoin que des résultats de matchs.
        break;
    }
  }

  return Object.values(todos);
}
