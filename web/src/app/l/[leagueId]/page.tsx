"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLeagueCtx } from "./LeagueShell";
import { useMatches, useWeekBonuses, useMyEntry, useStandings } from "@/hooks/firestore";
import { Card, StateBadge, BigNum, C } from "@/components/ui";
import { fmtCountdown, fmtDateTime, secsUntil } from "@/lib/format";

export default function Dashboard() {
  const { lid, sid, uid, currentWeek, tz, role } = useLeagueCtx();
  const router = useRouter();
  const n = currentWeek?.number ?? 1;
  const { matches } = useMatches(lid, sid, n);
  const { bonuses } = useWeekBonuses(lid, sid, n);
  const { entry } = useMyEntry(lid, sid, n, uid);
  const { standings } = useStandings(lid, sid);

  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(secsUntil(currentWeek?.deadlineAt?.toMillis?.()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [currentWeek]);

  const hasDeadline = !!currentWeek?.deadlineAt?.toMillis?.();
  const isStaff = role === "OWNER" || role === "ADMIN";
  const myStanding = standings.find((s) => s.uid === uid);
  const picksDone = Object.keys(entry?.gamePicks || {}).length;
  const bonusDone = Object.keys(entry?.bonusAnswers || {}).length;
  const isOpen = currentWeek?.state === "OPEN";

  return (
    <div className="flex flex-col gap-[14px] p-[18px]">
      <Card accent="am" className="p-[18px]">
        <div className="flex justify-between items-center mb-3">
          <div className="font-mono text-[10px] tracking-[0.14em] text-dim">{isOpen ? "FORMULAIRE OUVERT" : "SEMAINE " + n}</div>
          <StateBadge state={currentWeek?.state} />
        </div>
        {hasDeadline ? (
          <>
            <div className="text-[13px] text-mu mb-1">{left > 0 ? "Deadline dans" : "Deadline dépassée"}</div>
            <BigNum color={left > 0 ? C.am : C.rd} size={52}>{fmtCountdown(left)}</BigNum>
            <div className="font-mono text-[10px] text-dim mt-1">{fmtDateTime(currentWeek?.deadlineAt, tz)}</div>
          </>
        ) : (
          <>
            <div className="text-[13px] text-mu mb-1">Deadline</div>
            <BigNum color={C.dim} size={34}>NON DÉFINIE</BigNum>
            <div className="font-mono text-[10px] text-dim mt-1">
              {isStaff ? "À régler dans l'admin, section 3." : "Le commissaire ne l'a pas encore fixée."}
            </div>
          </>
        )}
        <div className="flex justify-between mt-3 font-mono text-[10px] text-dim">
          <span>{picksDone}/{matches.length} MATCHS</span>
          <span>{bonusDone}/{bonuses.length} BONUS</span>
        </div>
      </Card>

      <button
        onClick={() => router.push(isOpen ? `/l/${lid}/week/${n}` : `/l/${lid}/week/${n}/results`)}
        className="w-full min-h-[56px] bg-gr text-bg font-display font-extrabold text-[26px] tracking-[0.03em] cursor-pointer flex items-center justify-center gap-2"
      >
        {isOpen ? "REMPLIR MA GRILLE →" : "VOIR LES RÉSULTATS →"}
      </button>

      <div className="grid grid-cols-2 gap-[10px]">
        <Card className="p-[14px]">
          <div className="font-mono text-[10px] tracking-[0.12em] text-dim mb-1">MON RANG</div>
          <BigNum>{myStanding?.rank ?? "—"}</BigNum>
          <div className="text-xs text-mu mt-1">sur {standings.length} joueurs</div>
        </Card>
        <Card className="p-[14px]">
          <div className="font-mono text-[10px] tracking-[0.12em] text-dim mb-1">MES POINTS</div>
          <BigNum color={C.am}>{myStanding?.totalPoints ?? 0}</BigNum>
          <div className="text-xs text-mu mt-1">au général</div>
        </Card>
      </div>

      <div className="flex justify-between items-baseline mt-1">
        <div className="font-display font-extrabold text-[24px] tracking-[0.02em]">LES BONUS DE LA SEMAINE</div>
        <div className="font-mono text-[10px] text-dim">{bonuses.length}</div>
      </div>

      {bonuses.map((b) => (
        <Card key={b.id} className="p-[14px] flex items-center gap-3">
          <div className="w-1 self-stretch" style={{ background: C.am }} />
          <div className="flex-1">
            <div className="font-display font-extrabold text-[21px] leading-none tracking-[0.02em]">{b.title}</div>
            <div className="text-xs text-mu mt-1">{b.type}</div>
          </div>
        </Card>
      ))}
      {bonuses.length === 0 && <div className="text-dim text-sm">Pas de bonus cette semaine.</div>}
    </div>
  );
}
