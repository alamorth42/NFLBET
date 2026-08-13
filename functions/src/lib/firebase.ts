import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const authAdmin = admin.auth();
export { admin };

/** Timestamp Firestore de l'instant présent. */
export const now = () => admin.firestore.Timestamp.now();
