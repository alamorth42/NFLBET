"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLeagueCtx } from "../../LeagueShell";
import { useMatches, useWeekBonuses, useMyEntry, useTeams, usePlayers } from "@/hooks/firestore";
import { useEngineCatalog } from "@/hooks/engines";
import { BonusRenderer } from "@/components/BonusRenderer";
import { WeekSwitcher } from "@/components/WeekSwitcher";
import { C } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtKickoff } from "@/lib/format";
import { validateEntry } from "@/lib/validateEntry";

/** Clé du brouillon local — par ligue / saison / semaine / joueur. */
const draftKey = (lid: string, sid: string, n: number, uid: string) => `nflbet.draft.${lid}.${sid}.${n}.${uid}`;

export default function GridPage({ params }: { params: { w: string } }) {
  const { lid, sid, uid, currentWeek, season, tz } = useLeagueCtx();
  const router = useRouter();
  const n = parseInt(params.w, 10);
  const { matches } = useMatches(lid, sid, n);
  const { bonuses } = useWeekBonuses(lid, sid, n);
  const { entry } = useMyEntry(lid, sid, n, uid);
  const { teamById } = useTeams();
  const { players } = usePlayers();
  const { byType: engineByType } = useEngineCatalog();

  const [picks, setPicks] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const key = draftKey(lid, sid, n, uid);

  // Initialisation : la grille déjà soumise fait foi ; sinon on tente le brouillon local.
  useEffect(() => {
    if (entry) {
      setPicks(entry.gamePicks || {});
      setAnswers(entry.bonusAnswers || {});
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        setPicks(d.picks || {});
        setAnswers(d.answers || {});
        setRestored(true);
      }
    } catch {
      /* brouillon illisible : on repart de zéro */
    }
    setHydrated(true);
  }, [entry?.uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave : rien n'est perdu si on quitte la page avant de soumettre.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify({ picks, answers, savedAt: Date.now() }));
    } catch {
      /* quota plein : l'autosave est un confort, pas une garantie */
    }
  }, [picks, answers, hydrated, key]);

  const teamCodes = useMemo(() => Object.keys(teamById), [teamById]);
  const done = Object.keys(picks).length;
  const locked = currentWeek && currentWeek.state !== "OPEN";

  // Les erreurs de bonus seraient refusées par l'API ; les pronos manquants,
  // non — on bloque les premières et on fait confirmer les secondes.
  const problems = validateEntry({ matches, picks, bonuses, answers });
  const blocking = problems.filter((p) => p.scope !== "matches");
  const warnings = problems.filter((p) => p.scope === "matches");

  const submit = async () => {
    if (blocking.length) return;
    if (warnings.length && !confirmPartial) {
      setConfirmPartial(true);
      setMsg("Grille incomplète — reclique pour soumettre quand même.");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await api<{ state: string }>("PUT", `/leagues/${lid}/seasons/${sid}/entries/${n}`, {
        gamePicks: picks,
        bonusAnswers: answers,
      });
      try {
        localStorage.removeItem(key);
      } catch {
        /* sans importance */
      }
      setMsg(res.state === "LATE" ? "Grille enregistrée (EN RETARD, -3)" : "Grille soumise ✓");
      setTimeout(() => router.push(`/l/${lid}`), 800);
    } catch (e) {
      const err = e as ApiError;
      const map: Record<string, string> = {
        WEEK_LOCKED: "La semaine est verrouillée.",
        INVALID_BONUS_ANSWER: "Une réponse bonus est invalide.",
        INVALID_REFERENCE: "Un joueur/équipe sélectionné n'existe pas.",
      };
      setMsg(map[err.code] || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col pb-[150px]">
      {/* Barre de progression */}
      <div className="sticky top-[62px] z-[4] bg-bg px-[18px] pt-[14px] pb-3 border-b border-line">
        <div className="flex justify-between items-baseline mb-2">
          <div className="font-display font-extrabold text-[26px] tracking-[0.02em]">MA GRILLE</div>
          <div className="font-mono text-[11px] text-mu">{done}/{matches.length} MATCHS</div>
        </div>
        <div className="h-1 bg-s2">
          <div className="h-full bg-gr transition-all" style={{ width: `${matches.length ? (done / matches.length) * 100 : 0}%` }} />
        </div>
        <div className="mt-3">
          <WeekSwitcher n={n} startWeek={season?.startWeek} endWeek={season?.endWeek} hrefFor={(w) => `/l/${lid}/week/${w}`} />
        </div>
      </div>

      {locked && (
        <div className="mx-[18px] mt-3 p-3 text-xs" style={{ background: "#24140F", color: "#C7A6A6" }}>
          Semaine verrouillée — lecture seule.
        </div>
      )}

      {restored && !locked && (
        <div className="mx-[18px] mt-3 p-3 text-xs" style={{ background: C.s2, color: C.mu }}>
          Brouillon local restauré — pense à soumettre.
        </div>
      )}

      {/* Matchs */}
      <div className="px-[18px] pt-[14px] flex flex-col gap-2">
        {matches.map((m) => (
          <div key={m.id} className="bg-s1 border border-line px-3 py-[10px]">
            <div className="flex justify-between mb-2 font-mono text-[10px] text-dim tracking-[0.1em]">
              <span>{fmtKickoff(m.kickoffAt, tz)}</span>
            </div>
            <div className="grid grid-cols-2 gap-[6px]">
              {[
                { code: m.awayTeamId, side: "away" },
                { code: m.homeTeamId, side: "home" },
              ].map(({ code }) => {
                const on = picks[m.id] === code;
                return (
                  <button
                    key={code}
                    disabled={!!locked}
                    onClick={() => setPicks((p) => ({ ...p, [m.id]: code }))}
                    className="flex items-center gap-[9px] min-h-[52px] px-[10px] text-left transition-all"
                    style={{ border: `1px solid ${on ? C.gr : C.line}`, background: on ? C.gr : C.s2, color: on ? C.bg : C.tx }}
                  >
                    <span className="w-8 h-8 grid place-items-center font-display font-extrabold text-[15px]" style={{ background: on ? C.bg : C.line, color: on ? C.gr : C.mu }}>
                      {code}
                    </span>
                    <span className="text-sm font-bold">{teamById[code]?.name?.split(" ").slice(-1)[0] || code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {matches.length === 0 && <div className="text-dim text-sm">Aucun match pour cette semaine.</div>}
      </div>

      {/* Bonus (dynamiques) */}
      {bonuses.length > 0 && (
        <div className="px-[18px] pt-7 flex flex-col gap-3">
          <div className="flex items-center gap-[10px]">
            <div className="font-display font-extrabold text-[26px] tracking-[0.02em]">BONUS</div>
            <div className="flex-1 h-px bg-line" />
          </div>
          {bonuses.map((b) => (
            <BonusRenderer
              key={b.id}
              bonus={b}
              value={answers[b.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [b.id]: v }))}
              matches={matches}
              players={players}
              teamCodes={teamCodes}
              playerInput={engineByType[b.type]?.playerInput}
            />
          ))}
        </div>
      )}

      {/* Barre d'action */}
      {!locked && (
        <div className="fixed bottom-[64px] w-full max-w-[430px] z-[6] px-[18px] py-3 border-t border-line" style={{ background: "rgba(11,15,12,0.95)", backdropFilter: "blur(8px)" }}>
          {blocking.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {blocking.slice(0, 3).map((p, i) => (
                <div key={i} className="text-[11px]" style={{ color: C.am }}>{p.message}</div>
              ))}
              {blocking.length > 3 && <div className="text-[11px] text-dim">+{blocking.length - 3} autre(s).</div>}
            </div>
          )}
          {msg && <div className="text-xs mb-2" style={{ color: msg.includes("✓") ? C.gr : C.am }}>{msg}</div>}
          <button
            onClick={submit}
            disabled={submitting || blocking.length > 0}
            className="w-full min-h-[48px] bg-gr text-bg font-display font-extrabold text-[22px] tracking-[0.03em] cursor-pointer disabled:opacity-50"
          >
            {submitting ? "ENVOI…" : confirmPartial && warnings.length ? "SOUMETTRE QUAND MÊME" : "SOUMETTRE MA GRILLE"}
          </button>
        </div>
      )}
    </div>
  );
}
