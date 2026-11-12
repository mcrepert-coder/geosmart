import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE,
  fetchApi,
  refreshAdminTokens,
} from "@/lib/admin-server";

// Relais des alertes de chevauchement (contracts/land.yaml, ecran W3) :
// GET /overlap-alerts et POST /overlap-alerts/{auditSeq}/review.

type RouteContext = { params: Promise<{ parts?: string[] }> };

const ALLOWED_FILTERS = ["state", "limit"] as const;

function upstreamPath(request: NextRequest, parts: string[]): string | null {
  if (parts.length === 0 && request.method === "GET") {
    const search = new URLSearchParams();
    for (const key of ALLOWED_FILTERS) {
      const value = request.nextUrl.searchParams.get(key);
      if (value !== null) search.set(key, value);
    }
    return `/overlap-alerts${search.size ? `?${search.toString()}` : ""}`;
  }
  if (
    parts.length === 2 &&
    /^\d+$/.test(parts[0]) &&
    parts[1] === "review" &&
    request.method === "POST"
  ) {
    return `/overlap-alerts/${parts[0]}/review`;
  }
  return null;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { parts = [] } = await context.params;
  const path = upstreamPath(request, parts);
  if (!path) {
    return NextResponse.json({ message: "Route admin inconnue." }, { status: 404 });
  }

  try {
    const jar = await cookies();
    let accessToken = jar.get(ADMIN_ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;
    let tokens =
      !accessToken && refreshToken ? await refreshAdminTokens(refreshToken) : null;
    accessToken = tokens?.accessToken ?? accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { message: "Connexion administrateur requise." },
        { status: 401 },
      );
    }

    const body = request.method === "POST" ? await request.text() : undefined;
    const init: RequestInit = {
      method: request.method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body || undefined,
    };
    let upstream = await fetchApi(path, init, accessToken);
    if (upstream.status === 401 && refreshToken && !tokens) {
      tokens = await refreshAdminTokens(refreshToken);
      if (tokens) upstream = await fetchApi(path, init, tokens.accessToken);
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    if (tokens) {
      response.cookies.set(ADMIN_ACCESS_COOKIE, tokens.accessToken, {
        ...ADMIN_COOKIE_OPTIONS,
        maxAge: tokens.expiresIn,
      });
      response.cookies.set(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
        ...ADMIN_COOKIE_OPTIONS,
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service des alertes est indisponible." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
