"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { afterAuthRoute } from "@/lib/auth-nav";
import { authErrorMessage, finishGoogleRedirect, signInWithGoogle } from "@/lib/google-auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Retour d'une connexion Google en pleine page (repli quand la popup est
  // refusée) : la session est déjà établie, il ne reste qu'à router.
  useEffect(() => {
    let alive = true;
    finishGoogleRedirect().then((cred) => {
      if (alive && cred) router.replace(afterAuthRoute());
    });
    return () => {
      alive = false;
    };
  }, [router]);

  const fail = (e: any) => {
    setErr(authErrorMessage(e));
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    setErr(null);
    try {
      // `null` = bascule en redirection : la page part, on ne route pas ici.
      if (await signInWithGoogle()) router.replace(afterAuthRoute());
    } catch (e: any) {
      fail(e);
    }
  };

  const emailAuth = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      router.replace(afterAuthRoute());
    } catch (e: any) {
      fail(e);
    }
  };

  return (
    <div className="flex flex-col p-6 gap-6 pt-16">
      <div>
        <div className="font-display font-extrabold text-[62px] leading-[0.85] tracking-[0.02em]">
          NFL
          <br />
          BET
        </div>
        <div className="font-mono text-[11px] tracking-[0.16em] text-gr mt-2">18 SEMAINES · UNE SEULE VÉRITÉ</div>
      </div>

      <button
        onClick={google}
        disabled={busy}
        className="min-h-[52px] bg-gr text-bg font-display font-extrabold text-[22px] tracking-[0.03em] cursor-pointer disabled:opacity-40"
      >
        CONTINUER AVEC GOOGLE
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
          placeholder="mot de passe"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
        <button
          onClick={emailAuth}
          disabled={busy || !email || !pw}
          className="min-h-[48px] border border-gr text-gr font-display font-extrabold text-[18px] cursor-pointer disabled:opacity-40"
        >
          SE CONNECTER
        </button>
        <button onClick={() => router.push("/signup")} className="text-center text-sm text-dim cursor-pointer">
          Pas de compte ? Créer un compte
        </button>
      </div>

      {err && <div className="text-rd text-xs">{err}</div>}
    </div>
  );
}
