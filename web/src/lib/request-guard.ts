import { NextRequest, NextResponse } from "next/server";

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/// Protection minimale contre les requetes cross-site sur les routes mutantes.
export function rejectCrossSiteMutation(request: NextRequest): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return null;
  }
  const denied = () => NextResponse.json({ message: "Requête refusée." }, { status: 403 });
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin ?? referer;
  if (!source) return denied();
  const allowed = new Set(
    [request.nextUrl.origin, process.env.WEB_ORIGIN]
      .filter((v): v is string => Boolean(v))
      .map(normalizeOrigin)
      .filter((v): v is string => Boolean(v)),
  );
  const sourceOrigin = normalizeOrigin(source);
  if (!sourceOrigin || !allowed.has(sourceOrigin)) return denied();
  return null;
}
