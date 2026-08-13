import {
  GoogleAuthProvider,
  UserCredential,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Connexion Google, popup d'abord, redirection en repli.
 *
 * La popup est le chemin confortable (on reste sur la page) mais elle est
 * refusée dans les navigateurs intégrés — celui d'Instagram, de WhatsApp, de
 * Gmail — et par certains réglages de Safari sur iPhone. Or c'est exactement le
 * contexte d'un testeur qui ouvre le lien depuis une conversation. On bascule
 * donc en pleine page plutôt que d'afficher une erreur.
 */
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

function provider() {
  const p = new GoogleAuthProvider();
  // Sans ça, un navigateur déjà connecté à un compte Google enchaîne sans rien
  // demander : impossible de choisir avec quel compte on joue.
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

/**
 * @returns la session si la popup a abouti, `null` si on est parti en
 * redirection (la page est alors en train d'être déchargée).
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  try {
    return await signInWithPopup(auth, provider());
  } catch (e: any) {
    if (!POPUP_UNAVAILABLE.has(e?.code)) throw e;
    await signInWithRedirect(auth, provider());
    return null;
  }
}

/** Session récupérée au retour d'une redirection Google, sinon `null`. */
export async function finishGoogleRedirect(): Promise<UserCredential | null> {
  try {
    return await getRedirectResult(auth);
  } catch {
    // Un retour de redirection illisible (cookies tiers coupés) ne doit pas
    // casser l'écran de login : on laisse l'utilisateur réessayer.
    return null;
  }
}

/**
 * Message lisible. Le code brut est conservé entre parenthèses : les trois
 * pannes les plus fréquentes se règlent dans la console Firebase, et sans le
 * code on ne sait pas laquelle.
 */
export function authErrorMessage(e: any): string {
  const map: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/invalid-email": "E-mail invalide.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin.",
    "auth/network-request-failed": "Connexion réseau interrompue.",
    "auth/account-exists-with-different-credential":
      "Cet e-mail est déjà utilisé avec un autre mode de connexion (mot de passe).",
    "auth/operation-not-allowed":
      "La connexion Google n'est pas activée sur le projet Firebase (Authentication → Sign-in method).",
    "auth/unauthorized-domain":
      "Ce domaine n'est pas autorisé pour la connexion (Authentication → Settings → Domaines autorisés).",
  };
  const known = map[e?.code];
  if (known) return e?.code ? `${known} (${e.code})` : known;
  return `${e?.message || "Connexion impossible"}${e?.code ? ` (${e.code})` : ""}`;
}
