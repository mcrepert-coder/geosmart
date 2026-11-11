import { cookies } from "next/headers";

export const ADMIN_ACCESS_COOKIE = "gs_admin_access";
export const ADMIN_REFRESH_COOKIE = "gs_admin_refresh";
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:
    process.env.ADMIN_COOKIE_SECURE === "true" ||
    (process.env.ADMIN_COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production"),
  sameSite: "lax" as const,
  path: "/",
};

export type AdminActor = {
  id: string;
  role: string;
  accountActive: boolean;
  fullName?: string;
};

export type AdminTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  ).replace(/\/+$/, "");
}

export async function fetchApi(
  path: string,
  init?: RequestInit,
  accessToken?: string,
): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

export async function parseApiJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function refreshAdminTokens(
  refreshToken: string,
): Promise<AdminTokens | null> {
  const response = await fetchApi("/auth/tokens/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;
  return parseApiJson<AdminTokens>(response);
}

export async function currentAdmin(): Promise<{
  actor: AdminActor | null;
  tokens?: AdminTokens;
}> {
  const jar = await cookies();
  const accessToken = jar.get(ADMIN_ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return { actor: null };

  let token = accessToken;
  let refreshed: AdminTokens | null = null;
  if (!token && refreshToken) {
    refreshed = await refreshAdminTokens(refreshToken);
    token = refreshed?.accessToken;
  }
  if (!token) return { actor: null };

  let response = await fetchApi("/auth/me", undefined, token);
  if (response.status === 401 && refreshToken && !refreshed) {
    refreshed = await refreshAdminTokens(refreshToken);
    token = refreshed?.accessToken;
    if (token) response = await fetchApi("/auth/me", undefined, token);
  }
  if (!response.ok) return { actor: null };

  const actor = await parseApiJson<AdminActor>(response);
  if (!actor || actor.role !== "ADMIN" || actor.accountActive !== true) {
    return { actor: null };
  }
  return { actor, ...(refreshed ? { tokens: refreshed } : {}) };
}
