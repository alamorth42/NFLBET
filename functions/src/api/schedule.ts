import { ApiError } from "../lib/errors";
import { TEAMS } from "../data/teams";

/**
 * Calendrier NFL officiel via l'API publique du scoreboard ESPN (sans clé).
 * Sert uniquement à *pré-remplir* la création de matchs côté admin : rien n'est
 * écrit ici, l'admin valide (et corrige) avant d'envoyer POST .../matches.
 */
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

/** Abréviations ESPN qui diffèrent de nos teamId (ou héritées d'anciens noms). */
const ALIASES: Record<string, string> = {
  WSH: "WAS",
  LA: "LAR",
  JAC: "JAX",
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
};

const KNOWN = new Set(TEAMS.map((t) => t.id));

/** Abréviation ESPN -> teamId maison. Renvoie null si l'équipe est inconnue. */
function toTeamId(abbr?: string): string | null {
  if (!abbr) return null;
  const id = ALIASES[abbr.toUpperCase()] || abbr.toUpperCase();
  return KNOWN.has(id) ? id : null;
}

export interface ScheduledMatch {
  awayTeamId: string | null;
  homeTeamId: string | null;
  /** ISO 8601 UTC, tel que fourni par ESPN. */
  kickoffAt: string | null;
  externalId: string | null;
  /** Libellés bruts du provider, pour lever une ambiguïté à l'écran. */
  awayLabel: string;
  homeLabel: string;
}

export interface ScheduledResult extends ScheduledMatch {
  /** null tant que le match n'est pas terminé. */
  homeScore: number | null;
  awayScore: number | null;
  final: boolean;
}

/** Matchs d'une semaine de saison régulière (seasontype=2). */
export async function fetchNflWeek(season: number, week: number): Promise<ScheduledMatch[]> {
  return (await fetchNflWeekRaw(season, week)).map(({ homeScore, awayScore, final, ...m }) => m);
}

/** Idem, avec les scores : sert à la synchro des résultats. */
export async function fetchNflResults(season: number, week: number): Promise<ScheduledResult[]> {
  return fetchNflWeekRaw(season, week);
}

async function fetchNflWeekRaw(season: number, week: number): Promise<ScheduledResult[]> {
  const url = `${ESPN}?dates=${season}&seasontype=2&week=${week}&limit=100`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  let payload: any;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (e: any) {
    throw new ApiError(
      502,
      "SCHEDULE_UNAVAILABLE",
      `Calendrier NFL indisponible (${e.name === "AbortError" ? "délai dépassé" : e.message}). Saisis les matchs à la main.`
    );
  } finally {
    clearTimeout(timer);
  }

  const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
  const out: ScheduledResult[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    const competitors: any[] = comp?.competitors || [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    // « completed » ne passe à true qu'une fois le match officiellement terminé
    // (et pas pendant les prolongations) : c'est notre seule condition pour
    // écrire un résultat.
    const final = comp?.status?.type?.completed === true;
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
    out.push({
      awayTeamId: toTeamId(away.team?.abbreviation),
      homeTeamId: toTeamId(home.team?.abbreviation),
      kickoffAt: ev?.date || comp?.date || null,
      externalId: ev?.id ? `espn_${ev.id}` : null,
      awayLabel: away.team?.displayName || away.team?.abbreviation || "?",
      homeLabel: home.team?.displayName || home.team?.abbreviation || "?",
      homeScore: final ? num(home.score) : null,
      awayScore: final ? num(away.score) : null,
      final,
    });
  }
  // Ordre chronologique : c'est celui dans lequel l'admin remplit ses résultats.
  out.sort((a, b) => (a.kickoffAt || "").localeCompare(b.kickoffAt || ""));
  return out;
}
