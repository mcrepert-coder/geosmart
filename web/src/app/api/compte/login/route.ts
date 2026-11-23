import { NextRequest, NextResponse } from "next/server";
import { fetchApi, parseApiJson, type AdminTokens } from "@/lib/admin-server";
import { setUserCookies, type UserActor } from "@/lib/account-server";
import { isAgent, setAgentCookies } from "@/lib/agent-server";
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

  const tokens = await parseApiJson<AdminTokens & { message?: string }>(loginResponse);
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
  const actor = await parseApiJson<UserActor>(actorResponse);
  if (!actorResponse.ok || !actor?.id) {
    return NextResponse.json({ message: "Connexion impossible." }, { status: 502 });
  }
  const response = NextResponse.json({ actor });
  setUserCookies(response, tokens);
  if (isAgent(actor)) setAgentCookies(response, tokens);
  return response;
}
