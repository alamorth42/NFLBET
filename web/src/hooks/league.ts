"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Member, Role } from "@/lib/types";

/** Saison active de la ligue = la plus récente. */
export function useActiveSeason(lid: string) {
  const [sid, setSid] = useState<string | null>(null);
  const [season, setSeason] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, `leagues/${lid}/seasons`), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, (snap) => {
      const d = snap.docs[0];
      setSid(d ? d.id : null);
      setSeason(d ? { id: d.id, ...(d.data() as any) } : null);
      setLoading(false);
    });
  }, [lid]);
  return { sid, season, seasonName: season?.name ?? "", loading };
}

/** Membres de la ligue — source des noms affichables avant tout scoring. */
export function useMembers(lid: string) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, `leagues/${lid}/members`), (snap) =>
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })))
    );
  }, [lid]);
  const nameByUid: Record<string, string> = {};
  members.forEach((m) => (nameByUid[m.uid] = m.displayName || m.uid.slice(0, 6)));
  return { members, nameByUid };
}

/** Rôle du user courant dans la ligue. */
export function useMyRole(lid: string, uid?: string) {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, `leagues/${lid}/members/${uid}`), (s) =>
      setRole(s.exists() ? ((s.data() as any).role as Role) : null)
    );
  }, [lid, uid]);
  return role;
}

/** Métadonnées ligue. */
export function useLeague(lid: string) {
  const [league, setLeague] = useState<any>(null);
  useEffect(() => {
    return onSnapshot(doc(db, `leagues/${lid}`), (s) => setLeague(s.exists() ? { id: s.id, ...s.data() } : null));
  }, [lid]);
  return league;
}
