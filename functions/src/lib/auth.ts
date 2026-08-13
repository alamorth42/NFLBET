import { Request, Response, NextFunction } from "express";
import { authAdmin, db } from "./firebase";
import { ApiError, forbidden, unauthenticated } from "./errors";

export interface AuthedRequest extends Request {
  uid?: string;
}

/** Middleware Express : vérifie le Firebase ID token et pose req.uid. */
export async function verifyAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthenticated("Missing bearer token");
    const decoded = await authAdmin.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e: any) {
    next(e instanceof ApiError ? e : unauthenticated(e?.message));
  }
}

/** Rôle du user dans la ligue (null si non-membre ou inactif). */
export async function getRole(lid: string, uid: string): Promise<string | null> {
  const snap = await db.doc(`leagues/${lid}/members/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.status !== "ACTIVE") return null;
  return data.role ?? null;
}

export async function requireMember(lid: string, uid: string): Promise<string> {
  const role = await getRole(lid, uid);
  if (!role) throw forbidden("Not a league member");
  return role;
}

/**
 * Le créateur de la ligue (`ownerUid`) est admin quoi qu'il arrive.
 *
 * Filet de sécurité : `ownerUid` est écrit à la création et n'est jamais
 * modifié, alors qu'un document membre peut être réécrit (invitation rejouée,
 * import…). Sans ce garde-fou, un rôle écrasé verrouille la ligue pour de bon —
 * plus personne ne peut piloter les semaines, ni même se re-promouvoir.
 */
export async function requireAdmin(lid: string, uid: string): Promise<string> {
  const [role, leagueSnap] = await Promise.all([getRole(lid, uid), db.doc(`leagues/${lid}`).get()]);
  if (leagueSnap.data()?.ownerUid === uid) {
    // Et on répare au passage : le front lit le rôle sur le document membre,
    // c'est lui qui décide d'afficher le bouton ADMIN.
    if (role !== "OWNER")
      await db.doc(`leagues/${lid}/members/${uid}`).set({ uid, role: "OWNER", status: "ACTIVE" }, { merge: true });
    return "OWNER";
  }
  if (role !== "OWNER" && role !== "ADMIN") throw forbidden("Admin only");
  return role;
}
