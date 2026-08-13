/**
 * Tirage au sort des poules (Cage Fight) et des duos (Destins Liés).
 *
 * Ces deux moteurs lisent une composition FIGÉE dans `bonus.runtime`
 * (`runtime.pools` / `runtime.duos`). Sans elle, ils ne distribuent aucun point
 * — d'où ce module, appelé automatiquement au verrouillage de la semaine et
 * rejouable à la demande depuis la console admin.
 *
 * Le tirage est REPRODUCTIBLE : même graine ⇒ même composition. Le verrouillage
 * étant idempotent (il peut être rejoué par le job planifié), un tirage basé sur
 * Math.random() redistribuerait les poules dans le dos des joueurs.
 */

/** Hash 32 bits d'une chaîne (xmur3) — sert d'amorce au générateur. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates amorcé par `seed`. La liste d'entrée n'est pas modifiée. */
export function shuffle<T>(list: T[], seed: string): T[] {
  const out = [...list];
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A, B, C… puis A2, B2… au-delà de 26 poules (jamais atteint en pratique). */
export function poolName(i: number): string {
  const letter = String.fromCharCode(65 + (i % 26));
  const round = Math.floor(i / 26);
  return round ? `${letter}${round + 1}` : letter;
}

/**
 * Répartit les joueurs en poules de `poolSize` (au plus proche).
 *
 * Le nombre de poules est arrondi plutôt que plafonné : à 5 joueurs pour des
 * poules de 4, une poule de 5 vaut mieux que 4 + 1, où le joueur isolé serait
 * premier de poule d'office. La distribution est en tourniquet, donc les tailles
 * ne diffèrent jamais de plus d'un joueur.
 */
export function drawPools(uids: string[], poolSize: number, seed: string): Record<string, string[]> {
  const clean = Array.from(new Set(uids));
  if (clean.length === 0) return {};
  const size = Math.max(2, Math.floor(poolSize) || 4);
  let count = Math.max(1, Math.round(clean.length / size));
  while (count > 1 && clean.length / count < 2) count--;
  const pools: Record<string, string[]> = {};
  shuffle(clean, seed).forEach((uid, i) => {
    const key = poolName(i % count);
    (pools[key] ||= []).push(uid);
  });
  return pools;
}

/**
 * Duos tirés au sort. En nombre impair, le dernier reste `unpaired` : le moteur
 * additionne exactement deux scores, un trio fausserait le classement.
 */
export function drawDuos(uids: string[], seed: string): { duos: string[][]; unpaired: string[] } {
  const order = shuffle(Array.from(new Set(uids)), seed);
  const duos: string[][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) duos.push([order[i], order[i + 1]]);
  return { duos, unpaired: order.length % 2 ? [order[order.length - 1]] : [] };
}

/** Graine canonique d'un tirage. `nonce` sert aux retirages successifs. */
export function drawSeed(lid: string, sid: string, week: number, bonusId: string, nonce?: string): string {
  return [lid, sid, `W${week}`, bonusId, nonce].filter(Boolean).join(":");
}

export interface DrawableBonus {
  id: string;
  type: string;
  config?: any;
  runtime?: any;
}

export interface DrawContext {
  /** Joueurs concernés par la semaine (participants de la saison + grilles). */
  uids: string[];
  /** uid -> réponse du joueur À CE BONUS (pour l'inscription volontaire des duos). */
  answers: Record<string, any>;
  /** Graine du tirage : même graine ⇒ même composition. */
  seed: string;
  /** true = retirage explicite de l'admin, on écrase la composition existante. */
  force?: boolean;
}

/**
 * Patch `runtime` à écrire sur le bonus, ou `null` si le type ne se tire pas au
 * sort / si une composition existe déjà (sauf `force`).
 */
export function autoDrawRuntime(bonus: DrawableBonus, ctx: DrawContext): Record<string, unknown> | null {
  const stamp = { drawSource: ctx.force ? "REDRAW" : "AUTO", drawSeed: ctx.seed };

  if (bonus.type === "POOL_COMPETITION") {
    const existing = bonus.runtime?.pools;
    if (!ctx.force && existing && Object.keys(existing).length) return null;
    return { pools: drawPools(ctx.uids, bonus.config?.poolSize ?? 4, ctx.seed), ...stamp };
  }

  if (bonus.type === "DUO_COMPETITION") {
    const existing = bonus.runtime?.duos;
    if (!ctx.force && existing && existing.length) return null;
    // Inscription volontaire : seuls ceux qui ont coché « je participe » entrent
    // dans le chapeau. Sinon, tout le monde est tiré.
    const eligible = bonus.config?.optIn
      ? ctx.uids.filter((uid) => ctx.answers[uid]?.participate === true)
      : ctx.uids;
    const { duos, unpaired } = drawDuos(eligible, ctx.seed);
    return { duos, unpaired, ...stamp };
  }

  return null;
}
