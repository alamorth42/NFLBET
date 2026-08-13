/** Erreur API typée (mappée en réponse JSON { error }). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const unauthenticated = (m?: string) => new ApiError(401, "UNAUTHENTICATED", m);
export const forbidden = (m?: string) => new ApiError(403, "FORBIDDEN", m);
export const notFound = (m?: string) => new ApiError(404, "NOT_FOUND", m);
export const badRequest = (code: string, m?: string) => new ApiError(400, code, m);
