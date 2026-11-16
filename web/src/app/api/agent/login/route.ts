import { NextRequest, NextResponse } from "next/server";
import { fetchApi, parseApiJson, type AdminTokens } from "@/lib/admin-server";
import { isAgent, setAgentCookies, type AgentActor } from "@/lib/agent-server";

export async function POST(request: NextRequest) {
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
  const actor = await parseApiJson<AgentActor>(actorResponse);
  if (!actorResponse.ok || !isAgent(actor ?? null)) {
    return NextResponse.json(
      { message: "Ce compte n’est pas un compte agent." },
      { status: 403 },
    );
  }

  // Un agent en attente ou suspendu peut se connecter pour voir ses annonces ;
  // l'API refuse toute publication tant qu'il n'est pas actif (RG-05).
  const response = NextResponse.json({ actor });
  setAgentCookies(response, tokens);
  return response;
}
