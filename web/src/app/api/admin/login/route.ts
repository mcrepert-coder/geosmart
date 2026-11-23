import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  fetchApi,
  parseApiJson,
  type AdminActor,
  type AdminTokens,
} from "@/lib/admin-server";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

export async function POST(request: NextRequest) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;

  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("phone" in body) ||
    !("password" in body) ||
    typeof body.phone !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json({ message: "Téléphone et mot de passe requis." }, { status: 400 });
  }

  let loginResponse: Response;
  try {
    loginResponse = await fetchApi("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: body.phone, password: body.password }),
    });
  } catch {
    return NextResponse.json(
      { message: "Le service d’authentification est indisponible." },
      { status: 503 },
    );
  }

  const tokens = await parseApiJson<AdminTokens & { message?: string | string[] }>(
    loginResponse,
  );
  if (!loginResponse.ok || !tokens?.accessToken || !tokens.refreshToken) {
    return NextResponse.json(
      { message: tokens?.message ?? "Connexion impossible." },
      {
        status:
          loginResponse.status >= 400 && loginResponse.status < 600
            ? loginResponse.status
            : 502,
      },
    );
  }

  const actorResponse = await fetchApi("/auth/me", undefined, tokens.accessToken);
  const actor = await parseApiJson<AdminActor>(actorResponse);
  if (
    !actorResponse.ok ||
    !actor ||
    actor.role !== "ADMIN" ||
    actor.accountActive !== true
  ) {
    return NextResponse.json(
      { message: "Ce compte ne possède pas un accès administrateur actif." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ actor });
  response.cookies.set(ADMIN_ACCESS_COOKIE, tokens.accessToken, {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
