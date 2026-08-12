"use client";
import { useMemo, useState } from "react";
import { Player } from "@/lib/types";
import { initials } from "@/lib/format";
import { C } from "@/components/ui";

/** Autocomplete joueurs (catalog/players). Stocke les IDs, affiche Prénom NOM + TEAM. */
export function PlayerPicker({
  players,
  value,
  onChange,
  max,
  positionFilter,
}: {
  players: Player[];
  value: string[];
  onChange: (ids: string[]) => void;
  max: number;
  positionFilter?: string;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return players
      .filter((p) => (positionFilter ? p.position === positionFilter : true))
      .filter((p) => p.displayName.toLowerCase().includes(s) && !value.includes(p.id))
      .slice(0, 5);
  }, [q, players, value, positionFilter]);

  const add = (id: string) => {
    if (value.length >= max) return;
    onChange([...value, id]);
    setQ("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-[6px] mb-[10px]">
        {value.map((id) => {
          const p = byId[id];
          return (
            <div key={id} className="flex items-center gap-[7px] bg-s2 border border-gr px-[9px] py-[6px] text-xs animate-popIn">
              <span className="w-5 h-5 grid place-items-center text-[9px] font-bold" style={{ background: C.gr, color: C.bg }}>
                {initials(p?.displayName || id)}
              </span>
              <span>{p?.displayName || id}</span>
              <span className="font-mono text-[10px] text-dim">{p?.teamId}</span>
              <span onClick={() => onChange(value.filter((x) => x !== id))} className="cursor-pointer text-dim px-[2px]">
                ×
              </span>
            </div>
          );
        })}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chercher un joueur…"
        className="w-full box-border min-h-[44px] bg-bg border border-line text-tx px-3 text-sm outline-none focus:border-gr"
      />
      {results.length > 0 && (
        <div className="flex flex-col mt-[6px]">
          {results.map((p) => (
            <div
              key={p.id}
              onClick={() => add(p.id)}
              className="flex items-center gap-[9px] px-[10px] py-[9px] cursor-pointer border-b border-s2 min-h-[44px] hover:bg-s2"
            >
              <span className="w-6 h-6 grid place-items-center text-[9px] font-bold bg-line">{initials(p.displayName)}</span>
              <span className="flex-1 text-[13px]">{p.displayName}</span>
              <span className="font-mono text-[10px] text-dim">{p.teamId}</span>
            </div>
          ))}
        </div>
      )}
      <div className="font-mono text-[10px] text-dim mt-2">
        {value.length}/{max} · tape pour chercher
      </div>
    </div>
  );
}
