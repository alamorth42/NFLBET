"use client";
import { useEffect, useState } from "react";
import { useLeagueCtx } from "../LeagueShell";
import { useMatches, useTeams, useWeek, useWeekBonuses } from "@/hooks/firestore";
import { useEngineCatalog } from "@/hooks/engines";
import { api } from "@/lib/api";
import { ActionButton } from "@/components/ActionButton";
import { C, StateBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { Bonus, EngineMeta, Match, Member, Season, Team, Week, WeekState } from "@/lib/types";

/**
 * Console admin (v1 manuel). Couvre toute la boucle :
 * invitations → matchs → bonus → ouvrir → lock → résultats → stats → score.
 * Chaque action rend son résultat visible sur son propre bouton ; le journal
 * en bas ne sert qu'au détail (payload de réponse, code d'erreur).
 */
export default function AdminPage() {
  const { lid, sid, role, league, season, members, tz, currentWeek, latestWeek } = useLeagueCtx();
  // Tant que l'admin n'a pas choisi de semaine, on ouvre sur celle qui demande
  // une action : la semaine ouverte, sinon la plus avancée qu'il a préparée.
  // Atterrir sur la semaine 1 déjà clôturée n'a pas de sens et fait manipuler
  // des deadlines qui ne servent plus à rien.
  const [picked, setPicked] = useState<number | null>(null);
  const week =
    picked ??
    (currentWeek?.state === "OPEN" ? currentWeek.number : latestWeek?.number) ??
    currentWeek?.number ??
    season?.startWeek ??
    1;
  const setWeek = setPicked;
  const { matches } = useMatches(lid, sid, week);
  const { week: weekDoc } = useWeek(lid, sid, week);
  const { bonuses } = useWeekBonuses(lid, sid, week);
  // Année de la saison NFL, partagée par l'import du calendrier et la synchro
  // des scores.
  const [yearPick, setYearPick] = useState<number | null>(null);
  const nflYear = yearPick ?? defaultSeasonYear(season);
  const [log, setLog] = useState<string>("");
  const say = (m: string) => setLog((l) => `${new Date().toLocaleTimeString()} · ${m}\n${l}`);

  /** Joue une action, la trace dans le journal, et relaie l'erreur au bouton. */
  const run = async (label: string, fn: () => Promise<any>) => {
    try {
      const r = await fn();
      say(`✓ ${label} → ${JSON.stringify(r)}`);
      return r;
    } catch (e: any) {
      say(`✗ ${label} → ${e.code || e.message}`);
      throw e;
    }
  };

  if (role !== "OWNER" && role !== "ADMIN") return <div className="p-8 text-mu">Réservé aux admins.</div>;

  const journal = (
    <pre className="text-[11px] text-mu whitespace-pre-wrap bg-s1 border border-line p-2 max-h-48 overflow-auto">{log || "— journal —"}</pre>
  );

  // Sans saison, rien d'autre n'est adressable : on ne propose que sa création.
  if (!sid)
    return (
      <div className="flex flex-col gap-4 p-[18px]">
        <div className="font-display font-extrabold text-[28px]">ADMIN</div>
        <Section title="Créer la saison">
          <SeasonForm onSubmit={(body) => run("créer saison", () => api("POST", `/leagues/${lid}/seasons`, body))} />
        </Section>
        {journal}
      </div>
    );

  const base = `/leagues/${lid}/seasons/${sid}`;
  const state = weekDoc?.state;

  return (
    <div className="flex flex-col gap-4 p-[18px]">
      <div className="flex items-center justify-between">
        <div className="font-display font-extrabold text-[28px]">ADMIN</div>
        <StateBadge state={state} />
      </div>

      <WeekPicker
        week={week}
        min={season?.startWeek ?? 1}
        max={season?.endWeek ?? 18}
        current={currentWeek?.number ?? null}
        state={state}
        onPick={setWeek}
      />

      <Section title="0. Inviter & participants">
        <InviteBlock lid={lid} code={league?.inviteCode} onDone={say} />
        <div className="h-px bg-line my-3" />
        <ParticipantsBlock members={members} participants={season?.participants || []}
          onAdd={(uid) => run("ajouter participant", () => api("POST", `${base}/participants`, { uid }))} />
      </Section>

      <Section title="1. Matchs">
        <MatchesForm
          week={week}
          year={nflYear}
          onYear={setYearPick}
          existing={matches}
          onSubmit={(list) => run("créer matchs", () => api("POST", `${base}/weeks/${week}/matches`, { matches: list }))}
        />
        <MatchList
          matches={matches}
          tz={tz}
          deletable={state === "UPCOMING" || state === "OPEN" || !state}
          onDelete={(m) =>
            run(`supprimer ${m.awayTeamId}@${m.homeTeamId}`, () => api("DELETE", `${base}/matches/${m.id}`))
          }
        />
      </Section>

      <Section title="2. Bonus">
        <BonusForm say={say} matches={matches} onSubmit={(body) => run("créer bonus", () => api("POST", `${base}/weeks/${week}/bonuses`, body))} />
        <BonusList
          bonuses={bonuses}
          onDelete={(b) => run(`supprimer bonus ${b.title || b.type}`, () => api("DELETE", `${base}/bonuses/${b.id}`))}
        />
      </Section>

      <Section title="3. Pilotage de la semaine">
        <WeekPilot
          weekDoc={weekDoc}
          tz={tz}
          onOpen={(deadlineAt) => run("ouvrir", () => api("POST", `${base}/weeks/${week}/open`, { deadlineAt }))}
          onLock={() => run("verrouiller", () => api("POST", `${base}/weeks/${week}/lock`, {}))}
        />
      </Section>

      <Section title="4. Résultats">
        <ActionButton
          label={`SYNCHRONISER LES SCORES (SAISON ${nflYear})`}
          onAction={() => run("synchro scores", () => api("POST", `${base}/weeks/${week}/sync-results`, { season: nflYear }))}
          variant="outline"
          disabled={matches.length === 0}
          disabledReason="Crée d'abord les matchs de la semaine."
        />
        <div className="text-dim text-[10px] mt-1 mb-3">
          Ne récupère que les matchs terminés, et n&apos;écrase jamais un score que tu as saisi à la main.
        </div>
        {matches.map((m) => (
          <ResultRow key={m.id} match={m}
            onSave={(h, a) => run(`résultat ${m.awayTeamId}@${m.homeTeamId}`, () => api("PUT", `${base}/matches/${m.id}/result`, { homeScore: h, awayScore: a }))} />
        ))}
        {matches.length === 0 && <div className="text-dim text-xs">Aucun match pour cette semaine.</div>}
      </Section>

      <Section title="5. Stats & scoring">
        <StatTodo base={base} week={week} say={say} />
        <div className="h-px bg-line my-3" />
        <ActionButton
          label="CALCULER LES SCORES"
          onAction={() => run("scorer", () => api("POST", `${base}/weeks/${week}/score`, {}))}
          disabled={state !== "LOCKED" && state !== "SCORING" && state !== "PUBLISHED"}
          disabledReason="Verrouille la semaine d'abord — le scoring lit les grilles révélées."
        />
        {state === "PUBLISHED" && (
          <div className="text-dim text-[10px] mt-1">Déjà publiée : relancer le calcul est sans risque (idempotent), utile après correction d&apos;un résultat.</div>
        )}
      </Section>

      {journal}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sélecteur de semaine                                                */
/* ------------------------------------------------------------------ */

const CLOSED_LABEL: Partial<Record<WeekState, string>> = {
  LOCKED: "verrouillée",
  SCORING: "en cours de calcul",
  PUBLISHED: "publiée",
};

function WeekPicker({
  week,
  min,
  max,
  current,
  state,
  onPick,
}: {
  week: number;
  min: number;
  max: number;
  current: number | null;
  state?: WeekState;
  onPick: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const isCurrent = current !== null && week === current;
  const closedLabel = state ? CLOSED_LABEL[state] : undefined;
  const step = (d: number) => (
    <button
      onClick={() => onPick(clamp(week + d))}
      disabled={d < 0 ? week <= min : week >= max}
      className="w-8 h-8 shrink-0 grid place-items-center border border-line text-tx cursor-pointer disabled:opacity-30 disabled:cursor-default"
      aria-label={d < 0 ? "Semaine précédente" : "Semaine suivante"}
    >
      {d < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.12em] text-dim">SEMAINE</span>
        {step(-1)}
        <input
          type="number"
          value={week}
          min={min}
          max={max}
          onChange={(e) => onPick(clamp(parseInt(e.target.value || String(min), 10)))}
          className="w-16 bg-s1 border border-line px-2 py-1 text-center"
        />
        {step(1)}
        {isCurrent ? (
          <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: C.gr }}>
            EN COURS
          </span>
        ) : (
          current !== null && (
            <button onClick={() => onPick(current)} className="font-mono text-[10px] tracking-[0.1em] underline cursor-pointer" style={{ color: C.gr }}>
              → SEMAINE {current} (EN COURS)
            </button>
          )
        )}
      </div>
      {!isCurrent && closedLabel && (
        <div className="text-[11px]" style={{ color: C.am }}>
          Semaine {closedLabel} : ce que tu modifies ici (deadline, résultats) touche une semaine déjà jouée.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pilotage de la semaine                                             */
/* ------------------------------------------------------------------ */

/** millis -> valeur d'un <input type="datetime-local"> (heure du navigateur). */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const FLOW: { key: WeekState; label: string }[] = [
  { key: "UPCOMING", label: "À VENIR" },
  { key: "OPEN", label: "OUVERTE" },
  { key: "LOCKED", label: "VERROUILLÉE" },
  { key: "PUBLISHED", label: "PUBLIÉE" },
];

function WeekPilot({
  weekDoc,
  tz,
  onOpen,
  onLock,
}: {
  weekDoc: Week | null;
  tz: string;
  onOpen: (deadlineAt: string) => Promise<any>;
  onLock: () => Promise<any>;
}) {
  const [dl, setDl] = useState("");
  const state = weekDoc?.state;
  const isOpen = state === "OPEN";

  // Préremplit avec la deadline déjà enregistrée : on modifie, on n'efface pas.
  useEffect(() => {
    const ms = weekDoc?.deadlineAt?.toMillis?.();
    if (ms) setDl(toLocalInput(ms));
  }, [weekDoc?.deadlineAt]);

  const currentIdx = FLOW.findIndex((f) => f.key === (state || "UPCOMING"));
  const chosen = dl ? new Date(dl) : null;
  const inPast = chosen ? chosen.getTime() < Date.now() : false;

  return (
    <div className="flex flex-col gap-3">
      {/* Machine à états */}
      <div className="grid grid-cols-4 gap-[2px]">
        {FLOW.map((f, i) => {
          const done = i < currentIdx;
          const now = i === currentIdx;
          return (
            <div key={f.key} className="flex flex-col items-center gap-1">
              <div className="w-full h-[3px]" style={{ background: now ? C.gr : done ? C.line : C.s2 }} />
              <span className="font-mono text-[9px] tracking-[0.06em] text-center" style={{ color: now ? C.gr : done ? C.mu : C.dim }}>
                {f.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Deadline actuelle */}
      <div className="bg-bg border border-line p-2">
        <div className="font-mono text-[10px] tracking-[0.1em] text-dim">DEADLINE ENREGISTRÉE</div>
        {weekDoc?.deadlineAt ? (
          <div className="text-sm mt-1">{fmtDateTime(weekDoc.deadlineAt, tz)} <span className="text-dim text-[11px]">({tz})</span></div>
        ) : (
          <div className="text-sm mt-1" style={{ color: C.am }}>
            Aucune — le compte à rebours des joueurs restera à 00:00:00.
          </div>
        )}
      </div>

      {/* Réglage */}
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.1em] text-dim">
          {isOpen ? "MODIFIER LA DEADLINE" : "DEADLINE (heure de ton navigateur)"}
        </span>
        <input type="datetime-local" value={dl} onChange={(e) => setDl(e.target.value)}
          className="bg-bg border border-line px-2 py-[7px] text-sm" />
        {chosen && (
          <span className="text-[10px]" style={{ color: inPast ? C.am : C.dim }}>
            = {fmtDateTime({ toMillis: () => chosen.getTime() }, tz)} pour la ligue{inPast ? " — cette date est déjà passée, toutes les grilles seront EN RETARD." : ""}
          </span>
        )}
      </label>

      <ActionButton
        label={isOpen ? "METTRE À JOUR LA DEADLINE" : "OUVRIR LA SEMAINE"}
        onAction={() => onOpen(new Date(dl).toISOString())}
        disabled={!dl}
        disabledReason="Choisis une date et une heure : sans deadline, aucun retard ne peut être pénalisé."
      />

      <ActionButton
        label="VERROUILLER (révélation)"
        variant="warn"
        confirm
        confirmLabel="Confirmer — les grilles deviennent publiques"
        onAction={onLock}
        disabled={!isOpen}
        disabledReason={isOpen ? undefined : "La semaine doit être ouverte pour être verrouillée."}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocs                                                              */
/* ------------------------------------------------------------------ */

function SeasonForm({ onSubmit }: { onSubmit: (body: any) => Promise<any> }) {
  const [name, setName] = useState("2026/27");
  const [startWeek, setStartWeek] = useState(1);
  const [endWeek, setEndWeek] = useState(18);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 text-mu">nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-bg border border-line px-2 py-1 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 text-mu">de la semaine</span>
        <input type="number" min={1} max={18} value={startWeek} onChange={(e) => setStartWeek(Number(e.target.value))} className="w-20 bg-bg border border-line px-2 py-1 text-sm" />
        <span className="text-mu">à</span>
        <input type="number" min={1} max={18} value={endWeek} onChange={(e) => setEndWeek(Number(e.target.value))} className="w-20 bg-bg border border-line px-2 py-1 text-sm" />
      </label>
      <ActionButton label="CRÉER LA SAISON" onAction={() => onSubmit({ name, startWeek, endWeek })} disabled={!name} className="self-start" />
    </div>
  );
}

/** Code d'invitation : partage, copie du lien, régénération. */
function InviteBlock({ lid, code, onDone }: { lid: string; code?: string; onDone: (m: string) => void }) {
  const [current, setCurrent] = useState<string | undefined>(code);
  useEffect(() => setCurrent(code), [code]);

  const link = current && typeof window !== "undefined" ? `${window.location.origin}/join/${current}` : "";

  const regen = async () => {
    const r = await api<{ inviteCode: string }>("POST", `/leagues/${lid}/invite-code`, {});
    setCurrent(r.inviteCode);
    onDone(`✓ nouveau code : ${r.inviteCode} (l'ancien ne marche plus)`);
    return r;
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    onDone("✓ lien d'invitation copié");
  };

  return (
    <div>
      {current ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-extrabold text-[26px] tracking-[0.14em]" style={{ color: C.gr }}>{current}</span>
            <ActionButton label="Copier le lien" variant="outline" onAction={copy} />
          </div>
          {link && <div className="text-dim text-[10px] mt-1 break-all">{link}</div>}
        </>
      ) : (
        <div className="text-dim text-xs mb-2">Aucun code — les ligues créées avant cette version n&apos;en ont pas.</div>
      )}
      <ActionButton label={current ? "Régénérer" : "Générer un code"} variant="warn" onAction={regen}
        confirm={!!current} confirmLabel="Confirmer — l'ancien lien cessera de marcher" className="mt-2 self-start" />
    </div>
  );
}

/** Membres de la ligue et leur présence dans la saison courante. */
function ParticipantsBlock({ members, participants, onAdd }: { members: Member[]; participants: string[]; onAdd: (uid: string) => Promise<any> }) {
  if (members.length === 0) return <div className="text-dim text-xs">Aucun membre.</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] text-dim">MEMBRES ({members.length}) — {participants.length} dans la saison</div>
      {members.map((m) => {
        const inSeason = participants.includes(m.uid);
        return (
          <div key={m.uid} className="flex items-center gap-2 text-xs">
            <span className="flex-1">{m.displayName || m.uid.slice(0, 6)}</span>
            <span className="font-mono text-[10px] text-dim">{m.role}</span>
            {inSeason ? (
              <span className="font-mono text-[10px]" style={{ color: C.gr }}>✓ SAISON</span>
            ) : (
              <ActionButton label="Ajouter" variant="outline" onAction={() => onAdd(m.uid)} />
            )}
          </div>
        );
      })}
      <div className="text-dim text-[10px]">
        Seuls les participants de la saison reçoivent la pénalité de retard s&apos;ils n&apos;ont pas rendu de grille au verrouillage.
      </div>
    </div>
  );
}

/** Champ de formulaire : intitulé lisible au-dessus, explication en dessous. */
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-[13px] mb-[3px]">{label}</div>
      {help && <div className="text-dim text-[11px] mb-[5px] leading-snug">{help}</div>}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-s1 border border-line p-3">
      <div className="font-mono text-[11px] tracking-[0.08em] text-am mb-2">{title}</div>
      {children}
    </div>
  );
}

interface MatchRow {
  awayTeamId: string;
  homeTeamId: string;
  /** valeur d'un <input type="datetime-local">, heure du navigateur */
  kickoff: string;
  externalId: string | null;
}

/**
 * Année de saison NFL par défaut : celle du nom de saison (« 2026/27 ») sinon
 * déduite de la date — une semaine jouée en janvier appartient à l'année N-1.
 */
function defaultSeasonYear(season: Season | null): number {
  const fromName = season?.name?.match(/20\d{2}/)?.[0];
  if (fromName) return parseInt(fromName, 10);
  const d = new Date();
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
}

/** ISO UTC -> valeur d'un <input type="datetime-local"> (heure du navigateur). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "" : toLocalInput(ms);
}

const emptyRow = (): MatchRow => ({ awayTeamId: "", homeTeamId: "", kickoff: "", externalId: null });

function MatchesForm({
  week,
  year,
  onYear,
  existing,
  onSubmit,
}: {
  week: number;
  year: number;
  onYear: (y: number) => void;
  existing: Match[];
  onSubmit: (list: any[]) => Promise<any>;
}) {
  const { teams } = useTeams();
  const [rows, setRows] = useState<MatchRow[]>([emptyRow()]);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [txt, setTxt] = useState("");

  const byId: Record<string, Team> = {};
  teams.forEach((t) => (byId[t.id] = t));

  // Déjà en base pour cette semaine : on les affiche en clair et on ne les
  // renvoie pas (le back les ignorerait de toute façon).
  const existingKeys = new Set(existing.map((m) => `${m.awayTeamId}@${m.homeTeamId}`));
  const keyOf = (r: MatchRow) => `${r.awayTeamId}@${r.homeTeamId}`;

  const setRow = (i: number, patch: Partial<MatchRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  /** Récupère le calendrier officiel de la semaine et remplit les lignes. */
  const importSchedule = async () => {
    setImporting(true);
    setNote(null);
    try {
      const r = await api<{ matches: any[] }>("GET", `/nfl/schedule?season=${year}&week=${week}`);
      if (!r.matches.length) {
        setNote(`Aucun match renvoyé pour la semaine ${week} de la saison ${year}.`);
        return;
      }
      setRows(
        r.matches.map((m) => ({
          awayTeamId: m.awayTeamId || "",
          homeTeamId: m.homeTeamId || "",
          kickoff: isoToLocalInput(m.kickoffAt),
          externalId: m.externalId || null,
        }))
      );
      const unknown = r.matches.filter((m) => !m.awayTeamId || !m.homeTeamId).length;
      setNote(
        `${r.matches.length} match(s) importé(s)${unknown ? ` — ${unknown} équipe(s) non reconnue(s), à choisir à la main` : ""}. Vérifie puis crée.`
      );
    } catch (e: any) {
      setNote(e.message || e.code);
    } finally {
      setImporting(false);
    }
  };

  /** Repli « à l'ancienne » : coller des lignes « AWAY @ HOME ». */
  const applyPaste = () => {
    const parsed = txt
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [away, home] = l.split("@").map((s) => s.trim().toUpperCase());
        return { ...emptyRow(), awayTeamId: byId[away] ? away : "", homeTeamId: byId[home] ? home : "" };
      });
    if (parsed.length) setRows(parsed);
    setPaste(false);
  };

  const complete = rows.filter((r) => r.awayTeamId && r.homeTeamId && r.awayTeamId !== r.homeTeamId);
  const dupes = complete.filter((r) => existingKeys.has(keyOf(r)));
  const toCreate = complete.filter((r) => !existingKeys.has(keyOf(r)));
  const bad = rows.filter((r) => r.awayTeamId && r.homeTeamId && r.awayTeamId === r.homeTeamId).length;

  const submit = () =>
    onSubmit(
      toCreate.map((r) => ({
        awayTeamId: r.awayTeamId,
        homeTeamId: r.homeTeamId,
        kickoffAt: r.kickoff ? new Date(r.kickoff).toISOString() : null,
        externalId: r.externalId,
      }))
    ).then((res) => {
      setRows([emptyRow()]);
      return res;
    });

  return (
    <>
      {/* Import du calendrier officiel */}
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.12em] text-dim">SAISON NFL</span>
          <input
            type="number"
            value={year}
            onChange={(e) => onYear(parseInt(e.target.value || "0", 10))}
            className="w-24 bg-bg border border-line px-2 py-2 text-sm"
          />
        </label>
        <ActionButton
          label={importing ? "IMPORT…" : `IMPORTER LA SEMAINE ${week}`}
          onAction={importSchedule}
          disabled={importing || !year}
          disabledReason="Renseigne l'année de la saison."
        />
      </div>
      <div className="text-dim text-[10px] mt-1">
        Calendrier officiel (source ESPN) — les horaires arrivent dans ton fuseau, tu peux tout corriger avant de créer.
      </div>
      {note && <div className="text-[11px] mt-1" style={{ color: C.am }}>{note}</div>}
      {teams.length === 0 && (
        <div className="text-[11px] mt-1" style={{ color: C.rd }}>
          Référentiel des équipes vide : lance <span className="font-mono">npm run seed:teams</span> côté functions.
        </div>
      )}

      <div className="h-px bg-line my-3" />

      {/* Lignes de match */}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const already = r.awayTeamId && r.homeTeamId && existingKeys.has(keyOf(r));
          const same = r.awayTeamId && r.awayTeamId === r.homeTeamId;
          return (
            <div key={i} className="border p-2 flex flex-col gap-2" style={{ borderColor: same ? C.rd : C.line }}>
              <div className="flex items-center gap-1">
                <TeamSelect teams={teams} value={r.awayTeamId} onChange={(v) => setRow(i, { awayTeamId: v })} placeholder="Extérieur" />
                <span className="font-mono text-[11px] text-dim px-1">@</span>
                <TeamSelect teams={teams} value={r.homeTeamId} onChange={(v) => setRow(i, { homeTeamId: v })} placeholder="Domicile" />
                <button
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, k) => k !== i) : [emptyRow()]))}
                  aria-label="Supprimer la ligne"
                  className="w-7 h-7 shrink-0 grid place-items-center border border-line text-dim cursor-pointer hover:text-tx"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={r.kickoff}
                  onChange={(e) => setRow(i, { kickoff: e.target.value })}
                  className="bg-bg border border-line px-2 py-1 text-[12px] text-tx"
                />
                {already && <span className="font-mono text-[10px] text-dim">DÉJÀ CRÉÉ</span>}
                {same && <span className="font-mono text-[10px]" style={{ color: C.rd }}>MÊME ÉQUIPE</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-2">
        <button onClick={() => setRows((rs) => [...rs, emptyRow()])} className="text-[11px] underline cursor-pointer" style={{ color: C.gr }}>
          + Ajouter un match
        </button>
        <button onClick={() => setPaste((p) => !p)} className="text-[11px] underline text-dim cursor-pointer">
          Coller « AWAY @ HOME »
        </button>
      </div>

      {paste && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            rows={4}
            placeholder={"KC @ BUF\nDAL @ PHI"}
            className="w-full bg-bg border border-line p-2 font-mono text-xs"
          />
          <button onClick={applyPaste} className="self-start text-[11px] underline cursor-pointer" style={{ color: C.gr }}>
            Remplacer les lignes par ce texte
          </button>
        </div>
      )}

      <div className="text-dim text-[10px] mt-2">
        {toCreate.length} à créer
        {dupes.length > 0 && ` · ${dupes.length} déjà en base`}
        {bad > 0 && ` · ${bad} ligne(s) invalide(s)`}
        {existing.length > 0 && ` · semaine ${week} : ${existing.length} match(s) enregistré(s)`}
      </div>
      <ActionButton
        label="Créer les matchs"
        onAction={submit}
        disabled={toCreate.length === 0 || bad > 0}
        disabledReason={bad > 0 ? "Une ligne oppose une équipe à elle-même." : "Choisis au moins un match qui n'existe pas déjà."}
        className="mt-2 self-start"
      />
    </>
  );
}

/** Matchs déjà créés pour la semaine, avec suppression avant verrouillage. */
function MatchList({
  matches,
  tz,
  deletable,
  onDelete,
}: {
  matches: Match[];
  tz: string;
  deletable: boolean;
  onDelete: (m: Match) => Promise<any>;
}) {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort((a, b) => (a.kickoffAt?.toMillis?.() ?? 0) - (b.kickoffAt?.toMillis?.() ?? 0));
  return (
    <div className="mt-3 flex flex-col gap-1">
      <div className="font-mono text-[10px] tracking-[0.12em] text-dim">DÉJÀ CRÉÉS</div>
      {sorted.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 border border-line px-2 py-1">
          <div className="min-w-0">
            <div className="font-mono text-[12px]">
              {m.awayTeamId} @ {m.homeTeamId}
              {m.status === "FINAL" && m.result && (
                <span className="text-dim">
                  {" "}
                  · {m.result.awayScore}-{m.result.homeScore}
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] text-dim">
              {m.kickoffAt ? fmtDateTime(m.kickoffAt, tz) : "horaire non renseigné"}
            </div>
          </div>
          {deletable && (
            <ActionButton label="✕" onAction={() => onDelete(m)} variant="outline" confirm confirmLabel="SUPPRIMER ?" />
          )}
        </div>
      ))}
      {!deletable && (
        <div className="text-dim text-[10px]">Semaine verrouillée : les matchs ne sont plus supprimables.</div>
      )}
    </div>
  );
}

/** Bonus configurés pour la semaine, avec suppression. */
function BonusList({ bonuses, onDelete }: { bonuses: Bonus[]; onDelete: (b: Bonus) => Promise<any> }) {
  if (bonuses.length === 0) return <div className="text-dim text-[10px] mt-3">Aucun bonus pour cette semaine.</div>;
  return (
    <div className="mt-3 flex flex-col gap-1">
      <div className="font-mono text-[10px] tracking-[0.12em] text-dim">BONUS ACTIFS</div>
      {bonuses.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-2 border border-line px-2 py-1">
          <div className="min-w-0">
            <div className="text-[13px] truncate">{b.title || b.type}</div>
            <div className="font-mono text-[10px] text-dim">{b.type}</div>
          </div>
          <ActionButton label="✕" onAction={() => onDelete(b)} variant="outline" confirm confirmLabel="SUPPRIMER ?" />
        </div>
      ))}
    </div>
  );
}

/** Liste déroulante d'équipes, groupée par conférence. */
function TeamSelect({
  teams,
  value,
  onChange,
  placeholder,
}: {
  teams: Team[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const groups: { key: string; items: Team[] }[] = [
    { key: "AFC", items: teams.filter((t) => t.conference === "AFC") },
    { key: "NFC", items: teams.filter((t) => t.conference === "NFC") },
    { key: "Autres", items: teams.filter((t) => t.conference !== "AFC" && t.conference !== "NFC") },
  ].filter((g) => g.items.length > 0);
  const sorted = (list: Team[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 bg-bg border border-line text-tx px-2 py-2 text-[13px] outline-none focus:border-gr"
      style={{ color: value ? C.tx : C.dim }}
    >
      <option value="" style={{ background: C.s1, color: C.dim }}>
        {placeholder}
      </option>
      {groups.map((g) => (
        <optgroup key={g.key} label={g.key}>
          {sorted(g.items).map((t) => (
            <option key={t.id} value={t.id} style={{ background: C.s1, color: C.tx }}>
              {t.id} — {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Valeurs de départ d'un moteur : son `default`, sinon un fallback par type. */
function defaultsOf(e: EngineMeta) {
  const cfg: Record<string, any> = {};
  for (const f of e.configFields) {
    if (f.default !== undefined) cfg[f.key] = f.default;
    else if (f.type === "enum") cfg[f.key] = f.options?.[0] ?? "";
    else if (f.type === "boolean") cfg[f.key] = false;
    else if (f.type === "number") cfg[f.key] = 0;
    else if (f.type === "match") cfg[f.key] = "";
    else cfg[f.key] = null;
  }
  return cfg;
}

/**
 * Formulaire dynamique : la liste des moteurs et leurs champs viennent de
 * GET /config/engines, plus rien n'est codé en dur ici.
 */
function BonusForm({ onSubmit, say, matches }: { onSubmit: (body: any) => Promise<any>; say: (m: string) => void; matches: Match[] }) {
  const { engines, error } = useEngineCatalog();
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [raw, setRaw] = useState<Record<string, string>>({}); // champs `json`, édités en texte

  const select = (e: EngineMeta) => {
    setType(e.type);
    setTitle(e.title);
    const d = defaultsOf(e);
    setCfg(d);
    setRaw(Object.fromEntries(e.configFields.filter((f) => f.type === "json").map((f) => [f.key, JSON.stringify(d[f.key] ?? null)])));
  };

  // Sélectionne le premier moteur dès que le catalogue arrive.
  useEffect(() => {
    if (engines?.[0] && !type) select(engines[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engines]);

  useEffect(() => {
    if (error) say(`✗ /config/engines → ${error}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const engine = engines?.find((e) => e.type === type);

  const submit = async () => {
    if (!engine) return;
    const config: Record<string, any> = { ...cfg };
    for (const f of engine.configFields) {
      if (f.type === "match") {
        // Vide = pas de choix ⇒ on omet la clé plutôt que d'écrire "".
        if (!config[f.key]) delete config[f.key];
        continue;
      }
      if (f.type !== "json") continue;
      try {
        config[f.key] = JSON.parse(raw[f.key] ?? "null");
      } catch {
        throw new Error(`champ « ${f.key} » : JSON invalide`);
      }
    }
    return onSubmit({ type: engine.type, title: title || engine.title, config, optional: config.optional ?? false });
  };

  if (!engines) return <div className="text-dim text-xs">Chargement du catalogue…</div>;
  if (engines.length === 0) return <div className="text-dim text-xs">Catalogue vide.</div>;

  return (
    <>
      <select value={type} onChange={(e) => select(engines.find((x) => x.type === e.target.value)!)} className="w-full bg-bg border border-line p-2 text-sm">
        {engines.map((e) => (
          <option key={e.type} value={e.type}>
            {e.title}
          </option>
        ))}
      </select>

      {engine && (
        <>
          <div className="text-dim text-[11px] mt-1">{engine.description}</div>
          <div className="text-[11px] mt-1" style={{ color: engine.playerInput ? C.gr : C.dim }}>
            {engine.playerInput ? "Les joueurs devront faire un choix dans leur grille." : "Calculé automatiquement — les joueurs n'ont rien à saisir."}
          </div>

          <Field label="Nom affiché aux joueurs">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-bg border border-line px-2 py-[6px] text-sm" />
          </Field>

          {engine.configFields.map((f) => {
            const name = f.label || f.key;
            if (f.type === "boolean") {
              return (
                <div key={f.key} className="mt-3">
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={!!cfg[f.key]} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.checked }))} />
                    <span>{name}</span>
                  </label>
                  {f.help && <div className="text-dim text-[11px] mt-[3px] leading-snug">{f.help}</div>}
                </div>
              );
            }
            return (
              <Field key={f.key} label={name} help={f.help}>
                {f.type === "enum" ? (
                  <select value={cfg[f.key] ?? ""} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))} className="w-full bg-bg border border-line px-2 py-[6px] text-sm">
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {f.optionLabels?.[o] || o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "number" ? (
                  <input type="number" value={cfg[f.key] ?? 0} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: Number(e.target.value) }))} className="w-28 bg-bg border border-line px-2 py-[6px] text-sm" />
                ) : f.type === "match" ? (
                  <>
                    <select value={cfg[f.key] ?? ""} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))} className="w-full bg-bg border border-line px-2 py-[6px] text-sm">
                      <option value="">Automatique</option>
                      {matches.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.awayTeamId} @ {m.homeTeamId}
                        </option>
                      ))}
                    </select>
                    {matches.length === 0 && (
                      <div className="text-am text-[11px] mt-[3px]">Aucun match cette semaine — crée-les d&apos;abord (étape 1).</div>
                    )}
                  </>
                ) : (
                  <textarea value={raw[f.key] ?? ""} onChange={(e) => setRaw((r) => ({ ...r, [f.key]: e.target.value }))} rows={3} className="w-full bg-bg border border-line px-2 py-[6px] font-mono text-[11px]" />
                )}
              </Field>
            );
          })}
        </>
      )}

      <ActionButton label="Ajouter le bonus" onAction={submit} className="mt-2 self-start" />
    </>
  );
}

function ResultRow({ match, onSave }: { match: Match; onSave: (h: number, a: number) => Promise<any> }) {
  const [h, setH] = useState("");
  const [a, setA] = useState("");
  useEffect(() => {
    if (match.result) {
      setH(String(match.result.homeScore));
      setA(String(match.result.awayScore));
    }
  }, [match.result?.homeScore, match.result?.awayScore]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = h !== "" && a !== "" && !isNaN(Number(h)) && !isNaN(Number(a));
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="flex-1 font-mono text-xs">
        {match.awayTeamId} @ {match.homeTeamId}
        {match.status === "FINAL" && <span className="ml-1" style={{ color: C.gr }}>✓</span>}
      </span>
      <input value={a} onChange={(e) => setA(e.target.value)} placeholder="ext" className="w-14 bg-bg border border-line px-2 py-1 text-sm" />
      <input value={h} onChange={(e) => setH(e.target.value)} placeholder="dom" className="w-14 bg-bg border border-line px-2 py-1 text-sm" />
      <ActionButton label="OK" variant="outline" onAction={() => onSave(parseInt(h, 10), parseInt(a, 10))}
        disabled={!valid} disabledReason="" />
    </div>
  );
}

function StatTodo({ base, week, say }: { base: string; week: number; say: (m: string) => void }) {
  const [todo, setTodo] = useState<any[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  const load = async () => {
    const t = await api<any[]>("GET", `${base}/weeks/${week}/stat-todo`);
    setTodo(t);
    say(`stat-todo : ${t.length} cases`);
    return t;
  };

  const save = async () => {
    const stats = (todo || [])
      .filter((t) => t.entityType === "PLAYER")
      .map((t) => ({ playerId: t.entityId, [statField(t.statKey)]: Number(vals[t.entityId + t.statKey] || 0) }));
    const r = await api("PUT", `${base}/weeks/${week}/stats-override`, { stats });
    say(`✓ stats enregistrées → ${JSON.stringify(r)}`);
    return r;
  };

  const filled = (todo || []).filter((t) => vals[t.entityId + t.statKey] !== undefined && vals[t.entityId + t.statKey] !== "").length;

  return (
    <div>
      <ActionButton label="Charger les stats à saisir" variant="outline" onAction={load} className="self-start" />
      {todo !== null && todo.length === 0 && (
        <div className="text-dim text-[11px] mt-2">Aucune stat à saisir : les bonus de cette semaine n&apos;en demandent pas.</div>
      )}
      {todo && todo.length > 0 && (
        <>
          <div className="font-mono text-[10px] text-dim mt-2">{filled}/{todo.length} SAISIES</div>
          {todo.map((t) => (
            <div key={t.entityId + t.statKey} className="flex items-center gap-2 mt-1">
              <span className="flex-1 text-xs">{t.label}</span>
              <input value={vals[t.entityId + t.statKey] || ""} onChange={(e) => setVals((v) => ({ ...v, [t.entityId + t.statKey]: e.target.value }))}
                className="w-16 bg-bg border border-line px-2 py-1 text-sm" />
            </div>
          ))}
          <ActionButton label="Enregistrer les stats" onAction={save} className="mt-2 self-start" />
        </>
      )}
    </div>
  );
}

function statField(statKey: string): string {
  const map: Record<string, string> = { ANY_TD: "anyTd", RECEIVING_TD: "receivingTd", RUSHING_YARDS: "rushingYards", PASSING_INT: "passingInt", FG_LONGEST: "fgLongest" };
  return map[statKey] || "anyTd";
}
