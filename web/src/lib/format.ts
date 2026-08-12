export const pad = (n: number) => String(n).padStart(2, "0");

/** secondes -> HH:MM:SS */
export function fmtCountdown(secs: number): string {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** millis d'échéance -> secondes restantes */
export function secsUntil(deadlineMillis?: number | null): number {
  if (!deadlineMillis) return 0;
  return Math.floor((deadlineMillis - Date.now()) / 1000);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const DAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];

/** Fuseau de repli quand la ligue n'en déclare pas. */
export const DEFAULT_TZ = "Europe/Paris";

/**
 * Timestamp Firestore -> "JEU 02:15" dans le fuseau de la ligue.
 * Les kickoffs NFL tombent la nuit en Europe : afficher le bon jour compte.
 */
export function fmtKickoff(ts?: { toMillis(): number } | null, tz: string = DEFAULT_TZ): string {
  if (!ts) return "";
  const d = new Date(ts.toMillis());
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayIdx = new Date(d.toLocaleString("en-US", { timeZone: tz })).getDay();
  return `${DAYS[dayIdx] ?? ""} ${hh}:${mm}`.trim();
}

/** Timestamp Firestore -> "jeu. 12 sept. 02:15" dans le fuseau de la ligue. */
export function fmtDateTime(ts?: { toMillis(): number } | null, tz: string = DEFAULT_TZ): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts.toMillis()));
}
