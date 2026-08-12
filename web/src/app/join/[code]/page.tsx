"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { C } from "@/components/ui";

/**
 * Rejoindre une ligue via un lien d'invitation.
 * Si l'utilisateur n'est pas connecté, on mémorise le code et on l'envoie au
 * login : il revient ici automatiquement une fois authentifié.
 */
export default function JoinPage({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  const { user, loading, pseudo } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"IDLE" | "JOINING" | "ERROR">("IDLE");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      try {
        localStorage.setItem("nflbet.pendingInvite", code);
      } catch {
        /* pas bloquant */
      }
      router.replace("/login");
      return;
    }
    let alive = true;
    setStatus("JOINING");
    api<{ leagueId: string; name?: string }>("POST", `/invites/${code}/accept`, {
      displayName: pseudo,
    })
      .then((r) => {
        if (!alive) return;
        try {
          const recent = JSON.parse(localStorage.getItem("nflbet.leagues") || "[]");
          const next = [{ id: r.leagueId, name: r.name || r.leagueId }, ...recent.filter((x: any) => x.id !== r.leagueId)].slice(0, 6);
          localStorage.setItem("nflbet.leagues", JSON.stringify(next));
          localStorage.removeItem("nflbet.pendingInvite");
        } catch {
          /* pas bloquant */
        }
        router.replace(`/l/${r.leagueId}`);
      })
      .catch((e: any) => {
        if (!alive) return;
        setStatus("ERROR");
        setErr(e.code === "INVALID_INVITE_CODE" ? "Ce code d'invitation est inconnu ou a été régénéré." : e.message);
      });
    return () => {
      alive = false;
    };
  }, [user, loading, code, router]);

  return (
    <div className="flex flex-col gap-4 p-8 pt-16">
      <div className="font-display font-extrabold text-[34px] tracking-[0.02em]">INVITATION</div>
      <div className="font-mono text-[13px] tracking-[0.14em]" style={{ color: C.gr }}>{code}</div>
      {status === "JOINING" && <div className="text-mu text-sm">Rattachement à la ligue…</div>}
      {status === "ERROR" && (
        <>
          <div className="text-sm" style={{ color: C.rd }}>{err}</div>
          <button onClick={() => router.push("/l")} className="min-h-[48px] px-4 border border-gr font-display font-extrabold text-[18px]" style={{ color: C.gr }}>
            MES LIGUES
          </button>
        </>
      )}
    </div>
  );
}
