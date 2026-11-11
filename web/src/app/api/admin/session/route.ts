import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  currentAdmin,
} from "@/lib/admin-server";

export async function GET() {
  try {
    const { actor, tokens } = await currentAdmin();
    const response = NextResponse.json(
      actor ? { actor } : { message: "Connexion administrateur requise." },
      { status: actor ? 200 : 401 },
    );
    if (tokens) {
      response.cookies.set(ADMIN_ACCESS_COOKIE, tokens.accessToken, {
        ...ADMIN_COOKIE_OPTIONS,
        maxAge: tokens.expiresIn,
      });
      response.cookies.set(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
        ...ADMIN_COOKIE_OPTIONS,
        maxAge: 30 * 24 * 60 * 60,
      });
    } else if (!actor) {
      response.cookies.set(ADMIN_ACCESS_COOKIE, "", { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
      response.cookies.set(ADMIN_REFRESH_COOKIE, "", { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service d’authentification est indisponible." },
      { status: 503 },
    );
  }
}
