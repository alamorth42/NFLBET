"use client";
import { useMemo, useState } from "react";
import { useLeagueCtx } from "../LeagueShell";
import { useStandings } from "@/hooks/firestore";
import { Card, C } from "@/components/ui";

type Mode = "GENERAL" | "WEEK" | "PERIOD";

/** "W07" -> 7 (clé de perWeek écrite par le back). */
const weekNum = (k: string) => parseInt(k.replace(/^W/, ""), 10);

export default function StandingsPage() {
  const { lid, sid, uid, currentWeek, season, nameByUid } = useLeagueCtx();
  const { standings } = useStandings(lid, sid);

  const [mode, setMode] = useState<Mode>("GENERAL");
  const [week, setWeek] = useState(currentWeek?.number ?? 1);
  const [from, setFrom] = useState(season?.startWeek ?? 1);
  const [to, setTo] = useState(currentWeek?.number ?? season?.endWeek ?? 18);

  const startWeek = season?.startWeek ?? 1;
  const endWeek = season?.endWeek ?? 18;
  const weekOptions = Array.from({ length: Math.max(0, endWeek - startWeek + 1) }, (_, i) => startWeek + i);

  /**
   * Le back ne stocke qu'un classement général. Les vues semaine et période se
   * recalculent ici depuis `perWeek`, déjà présent sur chaque doc standing.
   */
  const rows = useMemo(() => {
    const scored = standings.map((s) => {
      const pw = s.perWeek || {};
      let points = s.totalPoints;
      if (mode === "WEEK") points = pw[`W${String(week).padStart(2, "0")}`] ?? 0;
      if (mode === "PERIOD")
        points = Object.entries(pw)
          .filter(([k]) => weekNum(k) >= from && weekNum(k) <= to)
          .reduce((a, [, v]) => a + (v || 0), 0);
      return { ...s, points, perWeek: pw };
    });
    scored.sort((a, b) => b.points - a.points);

    // Évolution : rang au général actuel vs rang au général sans la dernière
    // semaine jouée. Seulement pertinent en vue générale.
    const lastWeek = Math.max(0, ...standings.flatMap((s) => Object.keys(s.perWeek || {}).map(weekNum)));
    const before = standings
      .map((s) => ({
        uid: s.uid,
        total: Object.entries(s.perWeek || {})
          .filter(([k]) => weekNum(k) < lastWeek)
          .reduce((a, [, v]) => a + (v || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
    const rankBefore: Record<string, number> = {};
    before.forEach((r, i) => (rankBefore[r.uid] = i + 1));

    return scored.map((s, i) => ({
      ...s,
      position: i + 1,
      delta: mode === "GENERAL" && lastWeek > 0 && rankBefore[s.uid] ? rankBefore[s.uid] - (i + 1) : 0,
    }));
  }, [standings, mode, week, from, to]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const heights = [132, 168, 116];

  const nameOf = (u: string) => nameByUid[u] || u.slice(0, 6);

  const Delta = ({ d }: { d: number }) =>
    d === 0 ? null : (
      <span className="font-mono text-[10px]" style={{ color: d > 0 ? C.gr : C.rd }}>
        {d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}
      </span>
    );

  return (
    <div className="flex flex-col gap-[14px] p-[18px]">
      <div className="font-display font-extrabold text-[30px] tracking-[0.02em]">CLASSEMENT</div>

      <div className="grid grid-cols-3 border border-line">
        {([
          ["GENERAL", "Général"],
          ["WEEK", "Semaine"],
          ["PERIOD", "Période"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="min-h-[38px] font-mono text-[10px] tracking-[0.1em] cursor-pointer"
            style={{ background: mode === m ? C.gr : "transparent", color: mode === m ? C.bg : C.mu }}
          >
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === "WEEK" && (
        <select value={week} onChange={(e) => setWeek(parseInt(e.target.value, 10))} className="bg-s1 border border-line px-2 py-[7px] font-mono text-[11px]">
          {weekOptions.map((w) => (
            <option key={w} value={w}>WEEK {String(w).padStart(2, "0")}</option>
          ))}
        </select>
      )}

      {mode === "PERIOD" && (
        <div className="flex items-center gap-2 font-mono text-[11px] text-mu">
          <span>de</span>
          <select value={from} onChange={(e) => setFrom(parseInt(e.target.value, 10))} className="bg-s1 border border-line px-2 py-[7px]">
            {weekOptions.map((w) => <option key={w} value={w}>W{String(w).padStart(2, "0")}</option>)}
          </select>
          <span>à</span>
          <select value={to} onChange={(e) => setTo(parseInt(e.target.value, 10))} className="bg-s1 border border-line px-2 py-[7px]">
            {weekOptions.map((w) => <option key={w} value={w}>W{String(w).padStart(2, "0")}</option>)}
          </select>
        </div>
      )}

      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 items-end mt-1">
          {order.map((s, i) => {
            const first = s === podium[0];
            return (
              <div key={s.uid} className="bg-s1 border p-2 flex flex-col items-center justify-end gap-[6px]" style={{ height: heights[i], borderColor: first ? C.am : C.line }}>
                <div className="w-9 h-9" style={{ background: first ? C.gr : C.line }} />
                <div className="text-xs font-semibold truncate max-w-full">{nameOf(s.uid)}</div>
                <div className="font-display font-extrabold" style={{ fontSize: first ? 36 : 26, color: first ? C.am : C.tx, lineHeight: 0.9 }}>{s.points}</div>
                <div className="flex items-center gap-1">
                  <span className="font-display font-extrabold text-[20px]" style={{ color: first ? C.am : C.dim }}>{s.position}</span>
                  <Delta d={s.delta} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        {rest.map((s, i) => (
          <div key={s.uid} className="flex items-center gap-[10px] px-[13px] py-[11px]" style={{ borderBottom: i < rest.length - 1 ? `1px solid ${C.s2}` : undefined, background: s.uid === uid ? "rgba(69,208,122,0.06)" : undefined }}>
            <div className="font-display font-extrabold text-[22px] text-dim w-[26px]">{s.position}</div>
            <div className="w-7 h-7 bg-line" />
            <div className="flex-1 text-sm font-semibold flex items-center gap-2">
              {nameOf(s.uid)}
              <Delta d={s.delta} />
            </div>
            <div className="font-display font-extrabold text-[22px] w-[46px] text-right">{s.points}</div>
          </div>
        ))}
      </Card>

      {rows.length === 0 && <div className="text-dim text-sm">Classement vide (aucune semaine scorée).</div>}
      {mode === "WEEK" && rows.length > 0 && rows.every((r) => r.points === 0) && (
        <div className="text-dim text-xs">Aucun point sur cette semaine — elle n&apos;est peut-être pas encore scorée.</div>
      )}
    </div>
  );
}
