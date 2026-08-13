"use client";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  Query,
  DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Week, Match, Bonus, Entry, Standing, Score, Team, Player } from "@/lib/types";

const base = (lid: string, sid: string) => `leagues/${lid}/seasons/${sid}`;
const wid = (n: number) => `W${String(n).padStart(2, "0")}`;

/** Abonnement à une collection/requête. `key` force le re-subscribe. */
function useCollection<T>(makeQuery: () => Query | null, key: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = makeQuery();
    if (!q) return;
    return onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}

/** Abonnement à un document. */
function useDoc<T>(makeRef: () => DocumentReference | null, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ref = makeRef();
    if (!ref) return;
    return onSnapshot(ref, (s) => {
      setData(s.exists() ? ({ id: s.id, ...s.data() } as T) : null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}

/* ---------- Hooks métier ---------- */

/**
 * Semaine « en cours » de la ligue, au sens de celle qu'on joue.
 *
 * Ce n'est PAS la dernière semaine créée : l'admin prépare souvent les matchs
 * de la semaine suivante avant que la courante soit clôturée, et ça ne doit pas
 * déplacer le tableau de bord, le compte à rebours ni le lien vers la grille.
 * Ordre de priorité : la semaine ouverte → sinon la dernière entamée
 * (verrouillée/calculée/publiée) → sinon la première à venir.
 *
 * `latest` (la plus haute créée) reste exposée pour la console admin, qui elle
 * travaille bien sur la semaine la plus avancée.
 */
export function useCurrentWeek(lid: string, sid: string) {
  const { data, loading } = useCollection<Week>(
    () => query(collection(db, `${base(lid, sid)}/weeks`), orderBy("number", "asc")),
    `curweek:${lid}:${sid}`
  );
  const open = data.find((w) => w.state === "OPEN");
  const started = [...data].reverse().find((w) => w.state && w.state !== "UPCOMING");
  const upcoming = data.find((w) => !w.state || w.state === "UPCOMING");
  return { week: open ?? started ?? upcoming ?? null, latest: data[data.length - 1] ?? null, loading };
}

export function useWeek(lid: string, sid: string, n: number) {
  const { data, loading } = useDoc<Week>(
    () => doc(db, `${base(lid, sid)}/weeks/${wid(n)}`),
    `week:${lid}:${sid}:${n}`
  );
  return { week: data, loading };
}

/**
 * Ordre d'affichage des matchs : chronologique, le prochain coup d'envoi en
 * haut. Firestore renvoie les documents dans l'ordre de leur identifiant, ce
 * qui donne une grille mélangée ; on trie ici plutôt qu'avec un `orderBy`, pour
 * ne pas imposer un index composite et pour placer les matchs sans horaire à la
 * fin au lieu de les perdre.
 */
export const byKickoff = (a: Match, b: Match) =>
  (a.kickoffAt?.toMillis?.() ?? Infinity) - (b.kickoffAt?.toMillis?.() ?? Infinity);

export function useMatches(lid: string, sid: string, n: number) {
  const { data, loading } = useCollection<Match>(
    () => query(collection(db, `${base(lid, sid)}/matches`), where("week", "==", n)),
    `matches:${lid}:${sid}:${n}`
  );
  // Trié ici, une fois : la grille, les résultats, la console admin et les
  // widgets de bonus lisent tous ce hook.
  const matches = useMemo(() => [...data].sort(byKickoff), [data]);
  return { matches, loading };
}

/**
 * Tous les matchs de la saison — sert à calculer les bilans V-D des équipes.
 * Une saison plafonne à ~280 documents : un seul abonnement coûte moins qu'une
 * requête par semaine, et Firestore les sert depuis le cache local ensuite.
 */
export function useSeasonMatches(lid: string, sid: string) {
  const { data, loading } = useCollection<Match>(
    () => query(collection(db, `${base(lid, sid)}/matches`)),
    `allmatches:${lid}:${sid}`
  );
  return { matches: data, loading };
}

export function useWeekBonuses(lid: string, sid: string, n: number) {
  const { data, loading } = useCollection<Bonus>(
    () => query(collection(db, `${base(lid, sid)}/bonuses`), where("week", "==", n)),
    `bonuses:${lid}:${sid}:${n}`
  );
  return { bonuses: data, loading };
}

export function useMyEntry(lid: string, sid: string, n: number, uid?: string) {
  const { data, loading } = useDoc<Entry>(
    () => (uid ? doc(db, `${base(lid, sid)}/entries/${uid}_${wid(n)}`) : null),
    `entry:${lid}:${sid}:${n}:${uid}`
  );
  return { entry: data, loading };
}

export function useAllEntries(lid: string, sid: string, n: number) {
  const { data, loading } = useCollection<Entry & { id: string }>(
    () => query(collection(db, `${base(lid, sid)}/entries`), where("week", "==", n)),
    `entries:${lid}:${sid}:${n}`
  );
  return { entries: data, loading };
}

export function useScore(lid: string, sid: string, n: number, uid?: string) {
  const { data } = useDoc<Score>(
    () => (uid ? doc(db, `${base(lid, sid)}/scores/${uid}_${wid(n)}`) : null),
    `score:${lid}:${sid}:${n}:${uid}`
  );
  return data;
}

export function useWeekScores(lid: string, sid: string, n: number) {
  const { data } = useCollection<Score>(
    () => query(collection(db, `${base(lid, sid)}/scores`), where("week", "==", n)),
    `scores:${lid}:${sid}:${n}`
  );
  return data;
}

export function useStandings(lid: string, sid: string) {
  const { data, loading } = useCollection<Standing>(
    () => query(collection(db, `${base(lid, sid)}/standings`), orderBy("totalPoints", "desc")),
    `standings:${lid}:${sid}`
  );
  return { standings: data, loading };
}

export function useTeams() {
  const { data } = useCollection<Team>(() => query(collection(db, "teams")), "teams");
  const teamById: Record<string, Team> = {};
  data.forEach((t) => (teamById[t.id] = t));
  return { teams: data, teamById };
}

export function usePlayers() {
  const { data } = useCollection<Player>(() => query(collection(db, "players")), "players");
  return { players: data };
}
