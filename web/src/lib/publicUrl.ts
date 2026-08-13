/**
 * Adresse publique de l'app, pour tout lien destiné à SORTIR de l'app :
 * annonce de la semaine, lien d'invitation.
 *
 * On ne se sert pas de `window.location.origin` pour ça : l'app reste
 * joignable par plusieurs URL (le domaine App Hosting `*.hosted.app`, un
 * aperçu, localhost), et le commissaire qui prépare sa semaine depuis l'une
 * d'elles enverrait à sa ligue un lien qu'il ne voulait pas partager.
 * `NEXT_PUBLIC_PUBLIC_URL` fixe l'adresse canonique ; sans elle (dev), on
 * retombe sur l'origine courante.
 */
export function publicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window === "undefined" ? "" : window.location.origin;
}
