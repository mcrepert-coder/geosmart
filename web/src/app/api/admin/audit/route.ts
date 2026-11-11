import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE,
  fetchApi,
  refreshAdminTokens,
} from "@/lib/admin-server";

const ALLOWED_FILTERS = ["resourceType", "resourceId", "from", "limit"] as const;

export async function GET(request: NextRequest) {
  const search = new URLSearchParams();
  for (const key of ALLOWED_FILTERS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) search.set(key, value);
  }
  const verify = request.nextUrl.searchParams.get("verify") === "true";
  const path = verify
    ? "/audit/verify"
    : `/audit${search.size ? `?${search.toString()}` : ""}`;

  try {
    const jar = await cookies();
    let accessToken = jar.get(ADMIN_ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;
    let tokens =
      !accessToken && refreshToken
        ? await refreshAdminTokens(refreshToken)
        : null;
    accessToken = tokens?.accessToken ?? accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { message: "Connexion administrateur requise." },
        { status: 401 },
      );
    }

    let upstream = await fetchApi(path, undefined, accessToken);
    if (upstream.status === 401 && refreshToken && !tokens) {
      tokens = await refreshAdminTokens(refreshToken);
      if (tokens) upstream = await fetchApi(path, undefined, tokens.accessToken);
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
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
      { message: "Le service du journal est indisponible." },
      { status: 503 },
    );
  }
}
