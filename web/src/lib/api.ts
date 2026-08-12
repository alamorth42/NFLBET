import { auth } from "./firebase";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message || code);
  }
}

/** Toutes les ÉCRITURES métier passent par l'API (avec le Firebase ID token). */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* réponse vide */
  }
  if (!res.ok) {
    throw new ApiError(json?.error?.code || "API_ERROR", json?.error?.message);
  }
  return (json?.data as T) ?? (json as T);
}
