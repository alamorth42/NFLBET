/**
 * Extrait les références (joueurs, équipes, matchs) contenues dans les réponses
 * bonus d'une grille, en fonction du type de chaque bonus.
 * Sert à valider que les IDs pointent vers des entités existantes du référentiel.
 */
export function collectEntryRefs(
  bonusesById: Record<string, { type: string; config?: any }>,
  bonusAnswers: Record<string, any>
): { playerIds: string[]; teamIds: string[]; matchIds: string[] } {
  const playerIds = new Set<string>();
  const teamIds = new Set<string>();
  const matchIds = new Set<string>();

  for (const [bid, ans] of Object.entries(bonusAnswers || {})) {
    const b = bonusesById[bid];
    if (!b || !ans) continue;
    switch (b.type) {
      case "PLAYER_STAT_PICKS":
        if (b.config?.entity === "MATCH_TE") (ans.matches || []).forEach((m: string) => matchIds.add(m));
        else (ans.players || []).forEach((p: string) => playerIds.add(p));
        break;
      case "STAT_LEADERBOARD":
        (ans.players || []).forEach((p: string) => playerIds.add(p));
        break;
      case "MATCH_THE_LEADER":
        if (ans.playerId) playerIds.add(ans.playerId);
        break;
      case "TEAM_WAGER":
        if (ans.teamId) teamIds.add(ans.teamId);
        break;
      case "TEAM_STAT_QUESTIONS":
        Object.values(ans.answers || {}).forEach((t: any) => t && teamIds.add(t));
        break;
      case "LINKED_PARLAY":
        Object.values(ans.picks || {}).forEach((t: any) => t && teamIds.add(t));
        break;
      default:
        break;
    }
  }
  return { playerIds: [...playerIds], teamIds: [...teamIds], matchIds: [...matchIds] };
}
