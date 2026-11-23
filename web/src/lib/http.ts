class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function apiErrorMessage(value: unknown, fallback = "Une erreur inattendue est survenue."): string {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return fallback;
  if (!("message" in value)) return fallback;
  const message = (value as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(" ");
  }
  return fallback;
}

export async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(apiErrorMessage(body, `Erreur du serveur (${response.status}).`), response.status);
  }
  return body as T;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
