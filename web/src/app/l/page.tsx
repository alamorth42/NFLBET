"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { C } from "@/components/ui";

/**
 * Sélecteur de ligue. En v1 il n'y a pas d'index "mes ligues" côté back,
 * donc on mémorise les ligues récentes en localStorage + création / rejoindre.
 */
export default function LeaguePicker() {
  const { user, loading, pseudo, setPseudo } = useAuth();
  const router = useRouter();
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [seasonName, setSeasonName] = useState("2026/27");
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Édition du pseudo depuis cet écran (utile quand le compte vient de Google).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Affichage immédiat depuis le cache local, puis liste faisant foi côté
  // serveur (`?also=` sert à rattacher les ligues d'avant l'index).
  useEffect(() => {
    const cached: { id: string; name: string }[] = JSON.parse(localStorage.getItem("nflbet.leagues") || "[]");
    setRecent(cached);
    if (!user) return;
    api<{ leagues: { id: string; name: string }[] }>(
      "GET",
      `/me/leagues?also=${cached.map((c) => c.id).join(",")}`
    )
      .then((r) => {
        const list = r.leagues.map((l) => ({ id: l.id, name: l.name }));
        setRecent(list);
        localStorage.setItem("nflbet.leagues", JSON.stringify(list));
      })
      .catch(() => {
        /* hors ligne / API indisponible : on garde le cache */
      });
  }, [user]);

  const remember = (id: string, nm: string) => {
    const next = [{ id, name: nm }, ...recent.filter((r) => r.id !== id)];
    localStorage.setItem("nflbet.leagues", JSON.stringify(next));
    setRecent(next);
  };

  const savePseudo = async () => {
    const clean = draft.trim();
    if (clean.length < 2) return setErr("Pseudo trop court (2 caractères minimum).");
    setErr(null);
    await setPseudo(clean);
    setEditing(false);
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { leagueId } = await api<{ leagueId: string }>("POST", "/leagues", {
        name: name.trim(),
        displayName: pseudo,
      });
      // Crée d'emblée une saison (sinon la ligue n'a rien à afficher).
      await api("POST", `/leagues/${leagueId}/seasons`, {
        name: seasonName.trim() || "2026/27",
        startWeek: 1,
        endWeek: 18,
      });
      remember(leagueId, name.trim());
      router.push(`/l/${leagueId}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  /** Rejoindre par code d'invitation (6 caractères). */
  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const code = joinId.trim().toUpperCase();
      const r = await api<{ leagueId: string; name?: string }>("POST", `/invites/${code}/accept`, {
        displayName: pseudo,
      });
      remember(r.leagueId, r.name || r.leagueId);
      router.push(`/l/${r.leagueId}`);
    } catch (e: any) {
      setErr(e.code === "INVALID_INVITE_CODE" ? "Code d'invitation inconnu ou expiré." : e.message);
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <div className="flex flex-col p-6 gap-6 pt-12">
      <div className="flex items-start justify-between gap-3">
        <div className="font-display font-extrabold text-[40px] tracking-[0.02em] leading-[0.9]">MES LIGUES</div>
        <button
          onClick={logout}
          className="font-mono text-[10px] tracking-[0.1em] px-[9px] py-[6px] cursor-pointer shrink-0"
          style={{ color: C.rd, border: `1px solid ${C.rd}` }}
        >
          DÉCONNEXION
        </button>
      </div>

      {/* Pseudo */}
      <div className="bg-s1 border border-line p-4 flex flex-col gap-2">
        <div className="font-mono text-[10px] tracking-[0.14em] text-dim">PSEUDO</div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={24}
              autoFocus
              className="min-h-[44px] bg-bg border border-line text-tx px-3 outline-none focus:border-gr"
            />
            <div className="flex gap-2">
              <button onClick={savePseudo} className="min-h-[40px] px-4 bg-gr text-bg font-display font-extrabold text-[16px] cursor-pointer">
                ENREGISTRER
              </button>
              <button onClick={() => setEditing(false)} className="min-h-[40px] px-4 border border-line text-dim font-mono text-[11px] cursor-pointer">
                ANNULER
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="font-display font-extrabold text-[24px] leading-none">{pseudo || "—"}</div>
            <button
              onClick={() => {
                setDraft(pseudo);
                setEditing(true);
              }}
              className="font-mono text-[10px] tracking-[0.1em] text-gr border border-gr px-[9px] py-[6px] cursor-pointer"
            >
              MODIFIER
            </button>
          </div>
        )}
        <div className="font-mono text-[10px] text-dim">{user?.email}</div>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          {recent.map((r) => (
            <button key={r.id} onClick={() => router.push(`/l/${r.id}`)} className="text-left bg-s1 border border-line p-4 cursor-pointer hover:border-gr">
              <div className="font-display font-extrabold text-[20px]">{r.name}</div>
              <div className="font-mono text-[10px] text-dim">{r.id}</div>
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-2">
        <div className="font-mono text-[10px] tracking-[0.14em] text-dim">CRÉER UNE LIGUE</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nom de la ligue (ex. Les Touchdowns)"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
        <input
          value={seasonName}
          onChange={(e) => setSeasonName(e.target.value)}
          maxLength={20}
          placeholder="Nom de la saison (ex. 2026/27)"
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr"
        />
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="min-h-[48px] bg-gr text-bg font-display font-extrabold text-[18px] cursor-pointer disabled:opacity-40"
        >
          CRÉER
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-mono text-[10px] tracking-[0.14em] text-dim">REJOINDRE (CODE D&apos;INVITATION)</div>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value.toUpperCase())}
          placeholder="EX. K7MQ2P"
          maxLength={6}
          className="min-h-[48px] bg-s1 border border-line text-tx px-3 outline-none focus:border-gr font-mono tracking-[0.2em]"
        />
        <button
          onClick={join}
          disabled={busy || !joinId}
          className="min-h-[48px] border border-gr text-gr font-display font-extrabold text-[18px] cursor-pointer disabled:opacity-40"
        >
          REJOINDRE
        </button>
      </div>

      {err && <div className="text-rd text-xs">{err}</div>}
    </div>
  );
}
