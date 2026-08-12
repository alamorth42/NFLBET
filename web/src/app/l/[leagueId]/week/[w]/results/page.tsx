"use client";
import { useLeagueCtx } from "../../../LeagueShell";
import { useMatches, useAllEntries, useWeekScores, useWeek } from "@/hooks/firestore";
import { WeekSwitcher } from "@/components/WeekSwitcher";
import { Card, C } from "@/components/ui";

export default function ResultsPage({ params }: { params: { w: string } }) {
  const { lid, sid, season, nameByUid } = useLeagueCtx();
  const n = parseInt(params.w, 10);
  const { week } = useWeek(lid, sid, n);
  const { matches } = useMatches(lid, sid, n);
  const { entries } = useAllEntries(lid, sid, n);
  const scores = useWeekScores(lid, sid, n);

  const switcher = (
    <WeekSwitcher n={n} startWeek={season?.startWeek} endWeek={season?.endWeek} hrefFor={(w) => `/l/${lid}/week/${w}/results`} />
  );

  if (week && week.state === "OPEN") {
    return (
      <div className="flex flex-col gap-4 p-[18px]">
        {switcher}
        <div className="text-mu text-sm">Les grilles ne sont pas encore révélées (semaine ouverte).</div>
      </div>
    );
  }

  // Game of the Week
  const gotw = matches.find((m) => m.id === week?.gotwMatchId);
  const gotwVotes: Record<string, number> = {};
  if (gotw) entries.forEach((e) => { const p = e.gamePicks?.[gotw.id]; if (p) gotwVotes[p] = (gotwVotes[p] || 0) + 1; });

  const perfect = scores.filter((s) => s.perfectWeek);

  const players = entries.map((e) => ({ uid: e.uid, name: nameByUid[e.uid] || e.uid.slice(0, 6) }));

  return (
    <div className="flex flex-col gap-[14px] p-[18px]">
      <div className="font-display font-extrabold text-[30px] tracking-[0.02em]">RÉVÉLATION W{String(n).padStart(2, "0")}</div>
      {switcher}

      {gotw && (
        <Card accent="am" className="p-[14px]" >
          <div className="font-mono text-[10px] tracking-[0.14em] mb-2" style={{ color: C.am }}>GAME OF THE WEEK</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-center">
              <div className="font-display font-extrabold text-[28px]">{gotw.awayTeamId}</div>
              <div className="text-xs" style={{ color: C.gr }}>{gotwVotes[gotw.awayTeamId] || 0} votes</div>
            </div>
            <div className="flex-1 text-center font-mono text-[10px] text-dim">
              {gotw.result ? `${gotw.result.awayScore} — ${gotw.result.homeScore} FINAL` : "—"}
            </div>
            <div className="text-center">
              <div className="font-display font-extrabold text-[28px] text-dim">{gotw.homeTeamId}</div>
              <div className="text-xs" style={{ color: C.am }}>{gotwVotes[gotw.homeTeamId] || 0} votes</div>
            </div>
          </div>
        </Card>
      )}

      {perfect.length > 0 && (
        <Card className="p-3 flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.1em] px-[7px] py-1" style={{ background: C.gr, color: C.bg }}>PERFECT WEEK</span>
          <span className="text-[13px] text-mu">{perfect.map((s) => nameByUid[s.uid] || s.uid.slice(0, 6)).join(", ")}</span>
        </Card>
      )}

      {/* Tableau matchs × joueurs */}
      <Card>
        <div className="grid border-b border-line" style={{ gridTemplateColumns: `76px repeat(${players.length}, 1fr)` }}>
          <div className="px-2 py-2 font-mono text-[9px] text-dim">MATCH</div>
          {players.map((p) => (
            <div key={p.uid} className="px-1 py-2 text-center font-mono text-[9px] text-mu">{p.name.slice(0, 3).toUpperCase()}</div>
          ))}
        </div>
        {matches.map((m) => (
          <div key={m.id} className="grid border-b border-s2 items-center" style={{ gridTemplateColumns: `76px repeat(${players.length}, 1fr)` }}>
            <div className="px-2 py-2 font-mono text-[11px]">{m.awayTeamId}@{m.homeTeamId}</div>
            {players.map((p) => {
              const e = entries.find((x) => x.uid === p.uid);
              const pick = e?.gamePicks?.[m.id];
              const ok = m.result && pick === m.result.winnerTeamId;
              const has = !!pick;
              return (
                <div key={p.uid} className="py-2 text-center text-[13px]" style={{ color: !has ? C.dim : ok ? C.gr : C.rd, background: ok ? "rgba(69,208,122,0.07)" : "transparent" }}>
                  {!has ? "·" : ok ? "✓" : "✗"}
                </div>
              );
            })}
          </div>
        ))}
      </Card>

      {/* Détail des bonus */}
      <div className="font-display font-extrabold text-[24px] tracking-[0.02em] mt-1">DÉTAIL DES POINTS</div>
      {scores.map((s) => (
        <Card key={s.uid} className="p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="font-semibold text-sm">{nameByUid[s.uid] || s.uid.slice(0, 6)}</div>
            <div className="font-display font-extrabold text-[24px]" style={{ color: C.am }}>{s.weekTotal}</div>
          </div>
          <div className="flex justify-between py-1 text-xs text-mu">
            <span>Pronos ({s.correctPicks}/{s.totalPicks})</span>
            <span style={{ color: C.gr }}>+{s.gamePoints}</span>
          </div>
          {(s.bonusBreakdown || []).map((b, i) => (
            <div key={i} className="flex justify-between py-1 text-xs text-mu">
              <span>{b.detail || b.type}</span>
              <span style={{ color: b.points >= 0 ? C.gr : C.rd }}>{b.points >= 0 ? "+" : ""}{b.points}</span>
            </div>
          ))}
          {(s.penalties || []).map((p, i) => (
            <div key={i} className="flex justify-between py-1 text-xs text-mu">
              <span>Pénalité {p.type}</span>
              <span style={{ color: C.rd }}>{p.points}</span>
            </div>
          ))}
        </Card>
      ))}
      {scores.length === 0 && <div className="text-dim text-sm">Scores pas encore calculés.</div>}
    </div>
  );
}
