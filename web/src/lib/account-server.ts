import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_OPTIONS,
  fetchApi,
  parseApiJson,
  refreshAdminTokens,
  type AdminTokens,
} from "./admin-server";

// Session "Mon compte" du site : tout compte connecte, y compris en attente de
// validation, pour deposer ses pieces justificatives (EF-403).

export const USER_ACCESS_COOKIE = "gs_user_access";
export const USER_REFRESH_COOKIE = "gs_user_refresh";

export type UserActor = {
  id: string;
  role: string;
  accountActive: boolean;
  registeredSurveyor?: boolean;
  agentCertified?: boolean;
  fullName?: string;
};

export function setUserCookies(response: NextResponse, tokens: AdminTokens) {
  response.cookies.set(USER_ACCESS_COOKIE, tokens.accessToken, {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(USER_REFRESH_COOKIE, tokens.refreshToken, {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearUserCookies(response: NextResponse) {
  const options = { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 };
  response.cookies.set(USER_ACCESS_COOKIE, "", options);
  response.cookies.set(USER_REFRESH_COOKIE, "", options);
}

export async function userAccessToken(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  tokens: AdminTokens | null;
}> {
  const jar = await cookies();
  const accessToken = jar.get(USER_ACCESS_COOKIE)?.value ?? null;
  const refreshToken = jar.get(USER_REFRESH_COOKIE)?.value ?? null;
  if (accessToken) return { accessToken, refreshToken, tokens: null };
  if (!refreshToken) return { accessToken: null, refreshToken: null, tokens: null };
  const tokens = await refreshAdminTokens(refreshToken);
  return { accessToken: tokens?.accessToken ?? null, refreshToken, tokens };
}

export async function currentUser(): Promise<{
  actor: UserActor | null;
  tokens?: AdminTokens;
}> {
  const session = await userAccessToken();
  let token = session.accessToken;
  let refreshed = session.tokens;
  if (!token) return { actor: null };
  let response = await fetchApi("/auth/me", undefined, token);
  if (response.status === 401 && session.refreshToken && !refreshed) {
    refreshed = await refreshAdminTokens(session.refreshToken);
    token = refreshed?.accessToken ?? null;
    if (token) response = await fetchApi("/auth/me", undefined, token);
  }
  if (!response.ok) return { actor: null };
  const actor = await parseApiJson<UserActor>(response);
  if (!actor?.id) return { actor: null };
  return { actor, ...(refreshed ? { tokens: refreshed } : {}) };
}
