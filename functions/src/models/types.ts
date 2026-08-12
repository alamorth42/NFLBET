export type WeekState = "UPCOMING" | "OPEN" | "LOCKED" | "SCORING" | "PUBLISHED";
export type Role = "OWNER" | "ADMIN" | "PLAYER";

/** ID de semaine normalisé : W01 … W18. */
export const weekId = (n: number) => `W${String(n).padStart(2, "0")}`;

/** ID de grille : {uid}_W07. */
export const entryId = (uid: string, n: number) => `${uid}_${weekId(n)}`;

/** Chemin de base d'une saison. */
export const seasonPath = (lid: string, sid: string) => `leagues/${lid}/seasons/${sid}`;
