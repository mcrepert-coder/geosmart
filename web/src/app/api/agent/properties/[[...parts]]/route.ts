import { NextRequest, NextResponse } from "next/server";
import { fetchApi, refreshAdminTokens } from "@/lib/admin-server";
import { agentAccessToken, setAgentCookies } from "@/lib/agent-server";

// Relais de l'espace agent vers contracts/listings.yaml, avec le jeton de
// l'agent : mes biens, creation, modification, photos. Les lectures
// publiques passent directement par l'API.

type RouteContext = { params: Promise<{ parts?: string[] }> };

const UUID = /^[0-9a-f-]{36}$/i;

function upstreamPath(request: NextRequest, parts: string[]): string | null {
  const method = request.method;
  if (parts.length === 1 && parts[0] === "mine" && method === "GET") {
    const search = new URLSearchParams();
    for (const key of ["status", "page", "pageSize"]) {
      const value = request.nextUrl.searchParams.get(key);
      if (value !== null) search.set(key, value);
    }
    return `/properties/mine${search.size ? `?${search.toString()}` : ""}`;
  }
  if (parts.length === 0 && method === "POST") return "/properties";
  if (parts.length === 1 && UUID.test(parts[0]) && method === "PATCH") {
    return `/properties/${parts[0]}`;
  }
  if (parts.length === 2 && UUID.test(parts[0]) && parts[1] === "photos" && method === "POST") {
    return `/properties/${parts[0]}/photos`;
  }
  if (
    parts.length === 3 &&
    UUID.test(parts[0]) &&
    parts[1] === "photos" &&
    UUID.test(parts[2]) &&
    method === "DELETE"
  ) {
    return `/properties/${parts[0]}/photos/${parts[2]}`;
  }
  return null;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { parts = [] } = await context.params;
  const path = upstreamPath(request, parts);
  if (!path) {
    return NextResponse.json({ message: "Route agent inconnue." }, { status: 404 });
  }

  try {
    const session = await agentAccessToken();
    let tokens = session.tokens;
    if (!session.accessToken) {
      return NextResponse.json({ message: "Connexion agent requise." }, { status: 401 });
    }

    // Le corps est relu tel quel : JSON ou multipart (photo), avec son type.
    const contentType = request.headers.get("content-type");
    const body =
      request.method === "GET" || request.method === "DELETE"
        ? undefined
        : Buffer.from(await request.arrayBuffer());
    const init: RequestInit = {
      method: request.method,
      headers: body && contentType ? { "Content-Type": contentType } : undefined,
      body,
    };

    let upstream = await fetchApi(path, init, session.accessToken);
    if (upstream.status === 401 && session.refreshToken && !tokens) {
      tokens = await refreshAdminTokens(session.refreshToken);
      if (tokens) upstream = await fetchApi(path, init, tokens.accessToken);
    }

    const response = new NextResponse(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    if (tokens) setAgentCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service des annonces est indisponible." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
