"use client";
import { C } from "@/components/ui";

/** Grille de sélection d'une équipe parmi une liste de codes. */
export function TeamGrid({
  teams,
  value,
  onChange,
  danger,
  cols = 4,
}: {
  teams: string[];
  value?: string;
  onChange: (t: string) => void;
  danger?: boolean;
  cols?: number;
}) {
  return (
    <div className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {teams.map((t) => {
        const on = value === t;
        const accent = danger ? C.rd : C.gr;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="min-h-[44px] font-display font-extrabold text-[18px] tracking-[0.04em] cursor-pointer transition-all"
            style={{
              border: `1px solid ${on ? accent : C.line}`,
              background: on ? accent : C.s2,
              color: on ? C.bg : C.mu,
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
