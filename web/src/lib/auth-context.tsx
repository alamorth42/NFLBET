"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, updateProfile, User } from "firebase/auth";
import { auth } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Pseudo affichable : displayName, sinon la partie locale de l'e-mail. */
  pseudo: string;
  /** Écrit le pseudo sur le compte Firebase et rafraîchit le contexte. */
  setPseudo: (name: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  pseudo: "",
  setPseudo: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), []);

  // updateProfile mute l'objet user en place mais ne déclenche pas
  // onAuthStateChanged : on force une nouvelle valeur de contexte pour que les
  // écrans qui lisent displayName se re-rendent.
  const setPseudo = useCallback(async (name: string) => {
    const u = auth.currentUser;
    if (!u) return;
    await updateProfile(u, { displayName: name });
    setState({ user: u, loading: false });
  }, []);

  const pseudo = state.user?.displayName || state.user?.email?.split("@")[0] || "";

  return <Ctx.Provider value={{ ...state, pseudo, setPseudo }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
