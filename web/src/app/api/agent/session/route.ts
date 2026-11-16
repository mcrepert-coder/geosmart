import { NextResponse } from "next/server";
import { clearAgentCookies, currentAgent, setAgentCookies } from "@/lib/agent-server";

export async function GET() {
  try {
    const { actor, tokens } = await currentAgent();
    const response = NextResponse.json(
      actor ? { actor } : { message: "Connexion agent requise." },
      { status: actor ? 200 : 401 },
    );
    if (tokens) setAgentCookies(response, tokens);
    else if (!actor) clearAgentCookies(response);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service d’authentification est indisponible." },
      { status: 503 },
    );
  }
}
