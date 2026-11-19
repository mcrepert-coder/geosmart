import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  fetchApi,
  refreshAdminTokens,
} from "@/lib/admin-server";
import { cookies } from "next/headers";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

type RouteContext = { params: Promise<{ parts?: string[] }> };

function isAllowedPath(parts: string[], method: string): boolean {
  if (parts.length === 0) return method === "GET";
  if (!/^[0-9a-f-]{36}$/i.test(parts[0])) return false;
  if (parts.length === 1) return method === "GET";
  if (parts.length === 2 && parts[1] === "documents") {
    return method === "GET";
  }
  if (
    parts.length === 4 &&
    parts[1] === "documents" &&
    /^[0-9a-f-]{36}$/i.test(parts[2]) &&
    parts[3] === "content"
  ) {
    return method === "GET";
  }
  return (
    parts.length === 2 &&
    ((method === "PUT" && parts[1] === "role") ||
      (method === "POST" &&
        ["validate", "reject", "suspend"].includes(parts[1])))
  );
}

async function proxy(request: NextRequest, context: RouteContext) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;

  const { parts = [] } = await context.params;
  if (!isAllowedPath(parts, request.method)) {
    return NextResponse.json({ message: "Route admin inconnue." }, { status: 404 });
  }

  const jar = await cookies();
  let accessToken = jar.get(ADMIN_ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;
  let tokens = !accessToken && refreshToken
    ? await refreshAdminTokens(refreshToken)
    : null;
  accessToken = tokens?.accessToken ?? accessToken;
  if (!accessToken) {
    return NextResponse.json({ message: "Connexion administrateur requise." }, { status: 401 });
  }

  const suffix = parts.map(encodeURIComponent).join("/");
  const path = `/admin/accounts${suffix ? `/${suffix}` : ""}${request.nextUrl.search}`;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();
  const init: RequestInit = {
    method: request.method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body,
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
      ...(upstream.headers.get("content-disposition")
        ? { "Content-Disposition": upstream.headers.get("content-disposition")! }
        : {}),
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
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
