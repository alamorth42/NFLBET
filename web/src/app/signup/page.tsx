"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { afterAuthRoute } from "@/lib/auth-nav";

/** Création de compte : e-mail / mot de passe ou Google, avec choix du pseudo. */
export default function SignupPage() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clean = pseudo.trim();
  const pseudoOk = clean.length >= 2 && clean.length <= 24;

  const fail = (e: any) => {
    const map: Record<string, string> = {
      "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail.",
      "auth/invalid-email": "E-mail invalide.",
      "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
      "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin.",
    };
    setErr(map[e.code] || e.message);
    setBusy(false);
  };

  const google = async () => {
    if (!pseudoOk) return setErr("Choisis d'abord un pseudo (2 à 24 caractères).");
    setBusy(true);
    setErr(null);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await updateProfile(cred.user, { displayName: clean });
      router.replace(afterAuthRoute());
    } catch (e: any) {
      fail(e);
    }
  };

  const create = async () => {
    if (!pseudoOk) return setErr("Choisis un pseudo (2 à 24 caractères).");
    setBusy(true);
    setErr(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await updateProfile(cred.user, { displayName: clean });
      router.replace(afterAuthRoute());
    } catch (e: any) {
      fail(e);
    }
  };

  return (
    <div className="flex flex-col p-6 gap-6 pt-16">
      <div>
        <div className="font-display font-extrabold text-[62px] leading-[0.85] tracking-[0.02em]">
          CRÉER
          <br />
          UN COMPTE
        </div>
        <div className="font-mono text-[11px] tracking-[0.16em] text-gr mt-2">TON PSEUDO SERA VU PAR TA LIGUE</div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] tracking-[0.14em] text-dim">PSEUDO</label>
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={24}
          placeholder="ex. Achille"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
      </div>

      <button
        onClick={google}
        disabled={busy}
        className="min-h-[52px] bg-gr text-bg font-display font-extrabold text-[22px] tracking-[0.03em] cursor-pointer disabled:opacity-40"
      >
        S&apos;INSCRIRE AVEC GOOGLE
      </button>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="e-mail"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type="password"
          placeholder="mot de passe (6 caractères min.)"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
        <button
          onClick={create}
          disabled={busy || !email || !pw || !pseudoOk}
          className="min-h-[48px] border border-gr text-gr font-display font-extrabold text-[18px] cursor-pointer disabled:opacity-40"
        >
          CRÉER LE COMPTE
        </button>
        <button onClick={() => router.push("/login")} className="text-center text-sm text-dim cursor-pointer">
          Déjà un compte ? Se connecter
        </button>
      </div>

      {err && <div className="text-rd text-xs">{err}</div>}
    </div>
  );
}
