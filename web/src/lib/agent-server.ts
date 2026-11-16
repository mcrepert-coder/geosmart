import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_OPTIONS,
  fetchApi,
  parseApiJson,
  refreshAdminTokens,
  type AdminTokens,
} from "./admin-server";

// Session de l'espace agent (EF-301) : memes jetons que l'application, dans des
// cookies httpOnly distincts de ceux de l'administration.

export const AGENT_ACCESS_COOKIE = "gs_agent_access";
export const AGENT_REFRESH_COOKIE = "gs_agent_refresh";
export const AGENT_COOKIE_OPTIONS = ADMIN_COOKIE_OPTIONS;

export type AgentActor = {
  id: string;
  role: string;
  accountActive: boolean;
  agentCertified?: boolean;
  fullName?: string;
};

export function isAgent(actor: AgentActor | null): actor is AgentActor {
  return actor !== null && actor.role === "AGENT";
}

export function setAgentCookies(response: NextResponse, tokens: AdminTokens) {
  response.cookies.set(AGENT_ACCESS_COOKIE, tokens.accessToken, {
    ...AGENT_COOKIE_OPTIONS,
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(AGENT_REFRESH_COOKIE, tokens.refreshToken, {
    ...AGENT_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearAgentCookies(response: NextResponse) {
  const options = { ...AGENT_COOKIE_OPTIONS, maxAge: 0 };
  response.cookies.set(AGENT_ACCESS_COOKIE, "", options);
  response.cookies.set(AGENT_REFRESH_COOKIE, "", options);
}

/// Jeton d'acces de l'agent, renouvele si besoin. [tokens] est rempli quand
/// un renouvellement a eu lieu : l'appelant doit reposer les cookies.
export async function agentAccessToken(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  tokens: AdminTokens | null;
}> {
  const jar = await cookies();
  const accessToken = jar.get(AGENT_ACCESS_COOKIE)?.value ?? null;
  const refreshToken = jar.get(AGENT_REFRESH_COOKIE)?.value ?? null;
  if (accessToken) return { accessToken, refreshToken, tokens: null };
  if (!refreshToken) return { accessToken: null, refreshToken: null, tokens: null };
  const tokens = await refreshAdminTokens(refreshToken);
  return { accessToken: tokens?.accessToken ?? null, refreshToken, tokens };
}

/// Agent connecte, relu par GET /auth/me (role et etat viennent de la base).
export async function currentAgent(): Promise<{
  actor: AgentActor | null;
  tokens?: AdminTokens;
}> {
  const session = await agentAccessToken();
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
  const actor = await parseApiJson<AgentActor>(response);
  if (!isAgent(actor ?? null)) return { actor: null };
  return { actor: actor!, ...(refreshed ? { tokens: refreshed } : {}) };
}
