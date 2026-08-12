"use client";
import { createContext, useContext, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useActiveSeason, useMyRole, useLeague, useMembers } from "@/hooks/league";
import { useCurrentWeek } from "@/hooks/firestore";
import { initials, DEFAULT_TZ } from "@/lib/format";
import { C } from "@/components/ui";
import { League, Member, Role, Season, Week } from "@/lib/types";

interface LeagueCtx {
  lid: string;
  sid: string;
  role: Role | null;
  currentWeek: Week | null;
  /** Semaine la plus avancée créée (console admin) — pas forcément celle en cours. */
  latestWeek: Week | null;
  uid: string;
  league: League | null;
  season: Season | null;
  members: Member[];
  /** uid -> nom affichable, disponible dès l'inscription (pas besoin d'un scoring). */
  nameByUid: Record<string, string>;
  /** Fuseau de la ligue, pour tout affichage de date. */
  tz: string;
}
const Ctx = createContext<LeagueCtx | null>(null);
export const useLeagueCtx = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLeagueCtx hors provider");
  return c;
};

export function LeagueShell({ lid, children }: { lid: string; children: React.ReactNode }) {
  const { user, loading, pseudo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const league = useLeague(lid);
  const { sid, season, loading: sLoading } = useActiveSeason(lid);
  const role = useMyRole(lid, user?.uid);
  const { week, latest } = useCurrentWeek(lid, sid || "_");
  const { members, nameByUid } = useMembers(lid);

  if (loading || sLoading) return <div className="p-8 text-mu font-mono text-sm">Chargement…</div>;
  if (!user) {
    router.replace("/login");
    return null;
  }
  const staff = role === "OWNER" || role === "ADMIN";
  const adminRoute = pathname.endsWith("/admin");
  // Sans saison il n'y a rien à afficher — sauf l'admin, qui est précisément
  // l'écran où on en crée une. Bloquer l'admin ici serait un cul-de-sac.
  if (!sid && !(staff && adminRoute))
    return (
      <div className="p-8 flex flex-col gap-3 text-sm">
        <div className="text-mu">Aucune saison n&apos;existe pour cette ligue.</div>
        {staff ? (
          <button onClick={() => router.push(`/l/${lid}/admin`)} className="min-h-[44px] px-4 bg-gr text-bg font-display font-extrabold text-[18px] self-start">
            CRÉER UNE SAISON
          </button>
        ) : (
          <div className="text-dim">Le commissaire doit en créer une.</div>
        )}
        <button onClick={() => router.push("/l")} className="text-dim text-xs underline self-start mt-2">
          Mes ligues
        </button>
        <button
          onClick={async () => {
            await signOut(auth);
            router.replace("/login");
          }}
          className="text-xs underline self-start"
          style={{ color: C.rd }}
        >
          Se déconnecter
        </button>
      </div>
    );

  const nav = [
    { key: "", label: "Accueil", href: `/l/${lid}` },
    { key: "week", label: "Grille", href: `/l/${lid}/week/${week?.number ?? 1}` },
    { key: "results", label: "Résultats", href: `/l/${lid}/week/${week?.number ?? 1}/results` },
    { key: "standings", label: "Classement", href: `/l/${lid}/standings` },
    { key: "rules", label: "Règles", href: `/l/${lid}/rules` },
  ];
  const activeKey = pathname.includes("/results")
    ? "results"
    : pathname.includes("/week")
    ? "week"
    : pathname.includes("/standings")
    ? "standings"
    : pathname.includes("/rules")
    ? "rules"
    : "";
  const isStaff = role === "OWNER" || role === "ADMIN";
  const onAdmin = pathname.endsWith("/admin");

  return (
    <Ctx.Provider
      value={{
        lid,
        sid: sid || "",
        role,
        currentWeek: week,
        latestWeek: latest,
        uid: user.uid,
        league,
        season,
        members,
        nameByUid,
        tz: league?.timezone || DEFAULT_TZ,
      }}
    >
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className={`sticky top-0 ${menu ? "z-50" : "z-10"} flex items-center justify-between px-[18px] pt-[14px] pb-3 border-b border-line`} style={{ background: "rgba(11,15,12,0.92)", backdropFilter: "blur(8px)" }}>
          <div>
            <div className="font-display font-extrabold text-[22px] leading-none tracking-[0.02em]">{league?.name || "NFL BET"}</div>
            <div className="font-mono text-[10px] tracking-[0.12em] text-dim">{league?.buyInInfo?.enabled ? "LIGUE PRIVÉE" : "PRONOSTICS NFL"}</div>
          </div>
          <div className="flex items-center gap-2">
            {week && <span className="font-mono text-[10px] tracking-[0.1em] text-gr border border-gr px-[7px] py-1">WEEK {String(week.number).padStart(2, "0")}</span>}
            {isStaff && (
              <button
                onClick={() => router.push(onAdmin ? `/l/${lid}` : `/l/${lid}/admin`)}
                className="font-mono text-[10px] tracking-[0.1em] px-[7px] py-1 cursor-pointer"
                style={onAdmin ? { background: C.am, color: C.bg, border: `1px solid ${C.am}` } : { color: C.am, border: `1px solid ${C.am}` }}
              >
                ADMIN
              </button>
            )}
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label="Menu du compte"
              className="w-[30px] h-[30px] grid place-items-center font-display font-extrabold text-[15px] cursor-pointer"
              style={{ background: C.gr, color: C.bg }}
            >
              {initials(pseudo || "?")}
            </button>
          </div>

          {/* Menu du compte : pseudo, changement de ligue, déconnexion. */}
          {menu && (
            <>
              <div className="fixed inset-0" onClick={() => setMenu(false)} />
              <div className="absolute right-[18px] top-full mt-1 z-10 w-[210px] bg-s1 border border-line flex flex-col">
                <div className="px-4 py-3 border-b border-line">
                  <div className="font-display font-extrabold text-[18px] leading-none">{pseudo}</div>
                  <div className="font-mono text-[10px] text-dim mt-1 truncate">{user.email}</div>
                </div>
                <button
                  onClick={() => {
                    setMenu(false);
                    router.push("/l");
                  }}
                  className="text-left px-4 min-h-[44px] font-mono text-[11px] tracking-[0.1em] text-tx hover:bg-s2 cursor-pointer"
                >
                  CHANGER DE LIGUE
                </button>
                <button
                  onClick={async () => {
                    setMenu(false);
                    await signOut(auth);
                    router.replace("/login");
                  }}
                  className="text-left px-4 min-h-[44px] font-mono text-[11px] tracking-[0.1em] hover:bg-s2 cursor-pointer border-t border-line"
                  style={{ color: C.rd }}
                >
                  SE DÉCONNECTER
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 pb-[70px]">{children}</div>

        {/* Bottom nav */}
        <div className="fixed bottom-0 w-full max-w-[430px] z-20 grid grid-cols-5 border-t border-line" style={{ background: "rgba(11,15,12,0.96)", backdropFilter: "blur(10px)" }}>
          {nav.map((n) => {
            const on = activeKey === n.key;
            return (
              <button key={n.label} onClick={() => router.push(n.href)} className="min-h-[64px] flex flex-col items-center justify-center gap-[7px] font-mono text-[10px] tracking-[0.06em] cursor-pointer" style={{ color: on ? C.tx : C.dim }}>
                <span className="w-[22px] h-[3px]" style={{ background: on ? C.gr : C.line }} />
                {n.label}
              </button>
            );
          })}
        </div>
      </div>
    </Ctx.Provider>
  );
}
