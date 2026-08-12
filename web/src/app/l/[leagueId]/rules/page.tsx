"use client";
import { useLeagueCtx } from "../LeagueShell";
import { useWeekBonuses } from "@/hooks/firestore";
import { useEngineCatalog } from "@/hooks/engines";
import { Card, C } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

/**
 * Règles & barème — tout est lu des données (règles de la ligue, bonus de la
 * semaine, catalogue de moteurs) plutôt que recopié en dur : si l'admin change
 * un barème, cette page suit.
 */
export default function RulesPage() {
  const { lid, sid, currentWeek, league, season, tz } = useLeagueCtx();
  const n = currentWeek?.number ?? 1;
  const { bonuses } = useWeekBonuses(lid, sid, n);
  const { byType } = useEngineCatalog();

  const r = league?.rules || {};
  const base = [
    { label: "Bon pronostic", value: `+${r.pointsPerCorrectPick ?? 1} pt` },
    { label: "Grille en retard", value: `${r.latePenalty ?? -3} pts` },
    { label: "Bonus divulgué (leak)", value: `${r.leakPenalty ?? -3} pts` },
    { label: "Révélation des grilles", value: r.revealPolicy === "ON_LOCK" ? "au verrouillage" : r.revealPolicy || "au verrouillage" },
    { label: "Verrouillage", value: r.lockPolicy === "FIXED_DEADLINE" ? "à la deadline fixée" : r.lockPolicy || "à la deadline fixée" },
  ];

  return (
    <div className="flex flex-col gap-[14px] p-[18px]">
      <div className="font-display font-extrabold text-[30px] tracking-[0.02em]">RÈGLES</div>

      <Card className="p-[14px]">
        <div className="font-mono text-[10px] tracking-[0.14em] text-dim mb-3">BARÈME DE BASE</div>
        {base.map((b) => (
          <div key={b.label} className="flex justify-between py-[6px] text-sm border-b border-s2 last:border-0">
            <span className="text-mu">{b.label}</span>
            <span className="font-semibold">{b.value}</span>
          </div>
        ))}
      </Card>

      <Card className="p-[14px]">
        <div className="font-mono text-[10px] tracking-[0.14em] text-dim mb-3">SAISON</div>
        <div className="flex justify-between py-[6px] text-sm border-b border-s2">
          <span className="text-mu">Nom</span>
          <span className="font-semibold">{season?.name || "—"}</span>
        </div>
        <div className="flex justify-between py-[6px] text-sm border-b border-s2">
          <span className="text-mu">Semaines</span>
          <span className="font-semibold">{season?.startWeek ?? 1} → {season?.endWeek ?? 18}</span>
        </div>
        <div className="flex justify-between py-[6px] text-sm border-b border-s2">
          <span className="text-mu">Fuseau</span>
          <span className="font-semibold">{tz}</span>
        </div>
        <div className="flex justify-between py-[6px] text-sm">
          <span className="text-mu">Deadline W{String(n).padStart(2, "0")}</span>
          <span className="font-semibold">{fmtDateTime(currentWeek?.deadlineAt, tz)}</span>
        </div>
      </Card>

      <div className="flex items-baseline justify-between mt-1">
        <div className="font-display font-extrabold text-[24px] tracking-[0.02em]">BONUS DE LA W{String(n).padStart(2, "0")}</div>
        <div className="font-mono text-[10px] text-dim">{bonuses.length}</div>
      </div>

      {bonuses.map((b) => {
        const meta = byType[b.type];
        return (
          <Card key={b.id} accent="am" className="p-[14px]">
            <div className="flex justify-between items-start gap-2">
              <div className="font-display font-extrabold text-[21px] leading-none tracking-[0.02em]">{b.title}</div>
              {b.optional && <span className="font-mono text-[10px] text-dim">OPTIONNEL</span>}
            </div>
            {meta?.description && <div className="text-xs text-mu mt-2">{meta.description}</div>}
            <div className="text-[11px] mt-2" style={{ color: meta?.playerInput === false ? C.dim : C.gr }}>
              {meta?.playerInput === false ? "Rien à remplir — attribué automatiquement." : "À remplir dans ta grille."}
            </div>
            {/* Réglages traduits via le catalogue : on n'affiche que ce qui a
                un intitulé lisible, le reste n'intéresse pas les joueurs. */}
            <div className="mt-2 flex flex-col gap-[3px]">
              {(meta?.configFields || [])
                .filter((f) => f.label && b.config?.[f.key] !== undefined && b.config?.[f.key] !== "")
                .map((f) => {
                  const v = b.config[f.key];
                  const shown =
                    f.type === "boolean"
                      ? v
                        ? "oui"
                        : "non"
                      : f.type === "enum"
                      ? f.optionLabels?.[v] || String(v)
                      : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v);
                  return (
                    <div key={f.key} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-dim">{f.label}</span>
                      <span className="text-mu text-right">{shown}</span>
                    </div>
                  );
                })}
            </div>
          </Card>
        );
      })}
      {bonuses.length === 0 && <div className="text-dim text-sm">Aucun bonus configuré cette semaine.</div>}

      <div className="text-dim text-[11px] mt-2">
        Le règlement complet fait foi. Cette page reflète la configuration réellement appliquée par le moteur de scoring.
      </div>
    </div>
  );
}
