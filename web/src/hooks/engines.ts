"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EngineMeta } from "@/lib/types";

/**
 * Catalogue des moteurs de bonus (GET /config/engines).
 * Immuable pendant la session → un seul fetch, mémorisé au niveau module et
 * partagé par l'admin (formulaire dynamique) et la grille (flag playerInput).
 */
let cache: EngineMeta[] | null = null;
let inflight: Promise<EngineMeta[]> | null = null;

export function useEngineCatalog() {
  const [engines, setEngines] = useState<EngineMeta[] | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    inflight = inflight || api<EngineMeta[]>("GET", "/config/engines");
    inflight
      .then((list) => {
        cache = list;
        if (alive) setEngines(list);
      })
      .catch((e: any) => {
        inflight = null; // laisse une prochaine tentative repartir
        if (alive) setError(e.code || e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const byType: Record<string, EngineMeta> = {};
  (engines || []).forEach((e) => (byType[e.type] = e));
  return { engines, byType, error };
}
