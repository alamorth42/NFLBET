export type WeekState = "UPCOMING" | "OPEN" | "LOCKED" | "SCORING" | "PUBLISHED";
export type Role = "OWNER" | "ADMIN" | "PLAYER";

export interface Member {
  uid: string;
  displayName?: string;
  role: Role;
  status?: "ACTIVE" | "INVITED" | "REMOVED";
}

export interface Season {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  participants?: string[];
}

export interface League {
  id: string;
  name: string;
  timezone?: string;
  inviteCode?: string;
  rules?: {
    pointsPerCorrectPick?: number;
    latePenalty?: number;
    leakPenalty?: number;
    revealPolicy?: string;
    lockPolicy?: string;
  };
}

export interface Team {
  id: string;
  name: string;
  conference?: string;
  division?: string;
}

export interface Player {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  teamId?: string;
  position?: "QB" | "RB" | "WR" | "TE" | "K" | "OTHER";
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
  margin: number;
}

export interface Match {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt?: { toMillis(): number } | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINAL";
  result?: MatchResult;
}

/** Composition figée d'un bonus : poules (Cage Fight) / duos (Destins Liés). */
export interface BonusRuntime {
  pools?: Record<string, string[]>;
  duos?: string[][];
  /** Joueurs laissés de côté par un tirage impair ou une non-inscription. */
  unpaired?: string[];
  drawSource?: "AUTO" | "REDRAW" | "MANUAL";
  drawnAt?: { toMillis(): number } | null;
}

export interface Bonus {
  id: string;
  week: number;
  type: string;
  title: string;
  optional?: boolean;
  config: any;
  runtime?: BonusRuntime;
}

/** Métadonnées d'un moteur de bonus, renvoyées par GET /config/engines. */
export interface EngineField {
  /** Nom réel dans `config` — technique, jamais affiché tel quel. */
  key: string;
  /**
   * Éditeur à afficher :
   *  - `match` : un match de la semaine (vide = automatique) ;
   *  - `matches` : plusieurs matchs cochés (combiné) ;
   *  - `comboItems` : lignes « match + QB domicile + QB extérieur » ordonnées ;
   *  - `questions` : lignes « statistique + extrême + points » ;
   *  - `numbers` : plusieurs nombres nommés (voir `fields`) ;
   *  - `json` : repli brut, ne devrait plus servir.
   */
  type: "number" | "boolean" | "enum" | "json" | "match" | "matches" | "comboItems" | "questions" | "numbers";
  default?: any;
  options?: string[];
  /** Sous-champs d'un `numbers` : clé technique -> intitulé. */
  fields?: { key: string; label: string }[];
  /** Intitulé lisible ; à défaut on retombe sur `key`. */
  label?: string;
  /** Traduction des valeurs d'un `enum` (valeur technique -> texte affiché). */
  optionLabels?: Record<string, string>;
  /** Précision affichée sous le champ dans le formulaire admin. */
  help?: string;
}
export interface EngineMeta {
  type: string;
  title: string;
  description: string;
  /** false = bonus automatique : rien à saisir par le joueur. */
  playerInput: boolean;
  configFields: EngineField[];
}

export interface Week {
  number: number;
  state: WeekState;
  deadlineAt?: { toMillis(): number } | null;
  bonusIds?: string[];
  gotwMatchId?: string | null;
}

export interface Entry {
  uid: string;
  week: number;
  state?: "DRAFT" | "SUBMITTED" | "LATE" | "LOCKED";
  gamePicks: Record<string, string>;
  bonusAnswers: Record<string, any>;
  weekState?: WeekState;
}

export interface Score {
  uid: string;
  week: number;
  gamePoints: number;
  correctPicks: number;
  totalPicks: number;
  perfectWeek: boolean;
  weekTotal: number;
  bonusBreakdown?: { bonusId: string; type: string; points: number; detail: string }[];
  penalties?: { type: string; points: number }[];
}

export interface Standing {
  uid: string;
  displayName?: string;
  totalPoints: number;
  rank: number;
  perWeek?: Record<string, number>;
}
