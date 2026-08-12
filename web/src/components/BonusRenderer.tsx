"use client";
import { Bonus, Match, Player } from "@/lib/types";
import { Card, C } from "@/components/ui";
import { PlayerPicker } from "@/components/bonuses/PlayerPicker";
import { TeamGrid } from "@/components/bonuses/TeamGrid";

/**
 * Rend UN bonus selon son `type`. La valeur = bonusAnswers[bonus.id].
 * ⚠️ Cœur de la logique : le front NE code PAS les bonus en dur, il dispatche par type.
 * Mapping type -> payload : voir docs/03-brief-frontend-nextjs.md §6.
 */
export function BonusRenderer({
  bonus,
  value,
  onChange,
  matches,
  players,
  teamCodes,
  playerInput,
}: {
  bonus: Bonus;
  value: any;
  onChange: (v: any) => void;
  matches: Match[];
  players: Player[];
  teamCodes: string[];
  /** Flag du catalogue : false = bonus automatique. undefined = catalogue pas encore chargé. */
  playerInput?: boolean;
}) {
  const weekTeamCodes = Array.from(new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])));

  const body = () => {
    switch (bonus.type) {
      /* ---- Sélection de joueurs (Trust Your WR, Champ, Dumpster) ---- */
      case "PLAYER_STAT_PICKS": {
        if (bonus.config?.entity === "MATCH_TE") {
          const selected: string[] = value?.matches || [];
          const maxSel = bonus.config?.selectionMax ?? 3;
          return (
            <div className="flex flex-col gap-[4px]">
              {matches.map((m) => {
                const on = selected.includes(m.id);
                const full = selected.length >= maxSel && !on;
                return (
                  <div
                    key={m.id}
                    onClick={() =>
                      onChange({
                        matches: on
                          ? selected.filter((x) => x !== m.id)
                          : full
                          ? selected
                          : [...selected, m.id],
                      })
                    }
                    className="flex items-center gap-[10px] min-h-[46px] px-[11px] cursor-pointer transition-all"
                    style={{
                      background: on ? "rgba(69,208,122,0.10)" : C.s2,
                      border: `1px solid ${on ? C.gr : "transparent"}`,
                      opacity: full ? 0.4 : 1,
                    }}
                  >
                    <span className="w-[22px] h-[22px] grid place-items-center text-xs" style={{ background: on ? C.gr : "transparent", color: C.bg, border: `1px solid ${on ? C.gr : C.line}` }}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="flex-1 font-mono text-[13px]">{m.awayTeamId} @ {m.homeTeamId}</span>
                  </div>
                );
              })}
              <div className="font-mono text-[10px] text-dim mt-2">{selected.length}/{maxSel} matchs</div>
            </div>
          );
        }
        return (
          <PlayerPicker
            players={players}
            value={value?.players || []}
            onChange={(players) => onChange({ players })}
            max={bonus.config?.selectionMax ?? 3}
            positionFilter={pos(bonus.config?.statKey)}
          />
        );
      }

      /* ---- Leaderboard (RB Death Match) ---- */
      case "STAT_LEADERBOARD":
        return (
          <PlayerPicker
            players={players}
            value={value?.players || []}
            onChange={(players) => onChange({ players })}
            max={bonus.config?.selectionCount ?? 2}
          />
        );

      /* ---- Nommer le leader (Kickerz) ---- */
      case "MATCH_THE_LEADER":
        return (
          <PlayerPicker
            players={players}
            value={value?.playerId ? [value.playerId] : []}
            onChange={(ids) => onChange({ playerId: ids[ids.length - 1] })}
            max={1}
            positionFilter={bonus.config?.statKey === "FG_LONGEST" ? "K" : undefined}
          />
        );

      /* ---- Pari sur une équipe (Melvyn / Quitte ou Double) ---- */
      case "TEAM_WAGER":
        return (
          <>
            <div className="flex items-center gap-2 mb-3 px-[11px] py-[9px]" style={{ background: "#24140F", borderLeft: `3px solid ${C.rd}` }}>
              <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: C.rd }}>PARI RISQUÉ</span>
              <span className="text-xs" style={{ color: "#C7A6A6" }}>Un seul choix, pas de retour arrière après le lock.</span>
            </div>
            <TeamGrid teams={weekTeamCodes.length ? weekTeamCodes : teamCodes} value={value?.teamId} onChange={(teamId) => onChange({ teamId })} danger />
          </>
        );

      /* ---- Questions par équipe (Puntos) ---- */
      case "TEAM_STAT_QUESTIONS": {
        const questions = bonus.config?.questions || [];
        const answers = value?.answers || {};
        return (
          <div className="flex flex-col gap-[14px]">
            {questions.map((q: any, i: number) => (
              <div key={q.id} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-display font-extrabold text-[18px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[13px] flex-1">{q.label || q.metric}</span>
                </div>
                <TeamGrid teams={weekTeamCodes} value={answers[q.id]} onChange={(t) => onChange({ answers: { ...answers, [q.id]: t } })} />
              </div>
            ))}
          </div>
        );
      }

      /* ---- Combo OUI/NON (Combinaison Parfaite) ---- */
      case "CUMULATIVE_COMBO": {
        const items = bonus.config?.items || [];
        const cur = value?.items || {};
        const toggle = (id: string, field: string, val: string) =>
          onChange({ items: { ...cur, [id]: { ...(cur[id] || {}), [field]: val } } });
        return (
          <div className="flex flex-col gap-2">
            {items.map((it: any, i: number) => {
              const m = matches.find((x) => x.id === it.matchId);
              const label = m ? `${m.awayTeamId} @ ${m.homeTeamId}` : it.matchId;
              return (
                <div key={it.id} className="bg-s2 p-[10px]">
                  <div className="font-mono text-[13px] mb-2">
                    <span className="font-display font-extrabold text-[18px] mr-2" style={{ color: C.am }}>{i + 1}</span>
                    {label}
                  </div>
                  {["QB_HOME", "QB_AWAY"].map((f) => (
                    <div key={f} className="flex items-center justify-between mb-1">
                      <span className="text-xs text-mu">{f === "QB_HOME" ? "QB domicile intercepté ?" : "QB extérieur intercepté ?"}</span>
                      <div className="flex gap-1">
                        {["YES", "NO"].map((v) => {
                          const on = cur[it.id]?.[f] === v;
                          return (
                            <button key={v} onClick={() => toggle(it.id, f, v)} className="min-w-[48px] min-h-[36px] font-mono text-[11px] cursor-pointer"
                              style={{ border: `1px solid ${on ? C.gr : C.line}`, background: on ? C.gr : C.bg, color: on ? C.bg : C.mu }}>
                              {v === "YES" ? "OUI" : "NON"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      }

      /* ---- Parlay lié (Thanksgiving Combine) ---- */
      case "LINKED_PARLAY": {
        const ids: string[] = bonus.config?.matchIds || matches.map((m) => m.id);
        const picks = value?.picks || {};
        return (
          <div className="flex flex-col gap-2">
            {ids.map((mid) => {
              const m = matches.find((x) => x.id === mid);
              if (!m) return null;
              return (
                <div key={mid} className="grid grid-cols-2 gap-[6px]">
                  {[m.awayTeamId, m.homeTeamId].map((t) => {
                    const on = picks[mid] === t;
                    return (
                      <button key={t} onClick={() => onChange({ picks: { ...picks, [mid]: t } })} className="min-h-[44px] font-display font-extrabold text-[16px] cursor-pointer"
                        style={{ border: `1px solid ${on ? C.gr : C.line}`, background: on ? C.gr : C.s2, color: on ? C.bg : C.tx }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      }

      /* ---- Duo (Destins Liés) ---- */
      case "DUO_COMPETITION":
        return (
          <button onClick={() => onChange({ participate: !value?.participate })} className="min-h-[44px] px-4 font-display font-extrabold text-[18px] cursor-pointer"
            style={{ border: `1px solid ${value?.participate ? C.gr : C.line}`, background: value?.participate ? C.gr : C.s2, color: value?.participate ? C.bg : C.mu }}>
            {value?.participate ? "JE PARTICIPE ✓" : "PARTICIPER LA SEMAINE PROCHAINE"}
          </button>
        );

      default:
        // Le catalogue fait foi : playerInput === false ⇒ rien à saisir, le
        // bonus est résolu au scoring. Sinon c'est un widget qui manque.
        return playerInput === false ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.1em] px-[7px] py-1" style={{ color: C.dim, border: `1px solid ${C.line}` }}>
              AUTOMATIQUE
            </span>
            <span className="text-xs text-dim">Rien à remplir — attribué après les matchs.</span>
          </div>
        ) : (
          <div className="text-xs text-dim">Type de bonus « {bonus.type} » : widget à venir.</div>
        );
    }
  };

  return (
    <Card accent="am" className="p-[14px]">
      <div className="flex justify-between items-start gap-[10px] mb-2">
        <div className="font-display font-extrabold text-[23px] leading-none tracking-[0.02em]">{bonus.title}</div>
        {bonus.optional && <span className="font-mono text-[10px] text-dim">OPTIONNEL</span>}
      </div>
      {body()}
    </Card>
  );
}

/** Filtre de position selon la stat visée (aide à l'autocomplete). */
function pos(statKey?: string): string | undefined {
  if (statKey === "PASSING_INT") return "QB";
  if (statKey === "RECEIVING_TD") return "WR";
  return undefined;
}
