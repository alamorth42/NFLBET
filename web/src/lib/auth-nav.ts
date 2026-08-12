/** Où atterrir après login/inscription : une invitation ouverte reprend son cours. */
export function afterAuthRoute(): string {
  let pending: string | null = null;
  try {
    pending = localStorage.getItem("nflbet.pendingInvite");
  } catch {
    /* pas bloquant */
  }
  return pending ? `/join/${pending}` : "/l";
}
