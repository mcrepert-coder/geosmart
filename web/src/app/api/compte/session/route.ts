import { NextResponse } from "next/server";
import { clearUserCookies, currentUser, setUserCookies } from "@/lib/account-server";

export async function GET() {
  try {
    const { actor, tokens } = await currentUser();
    const response = NextResponse.json(
      actor ? { actor } : { message: "Connexion requise." },
      { status: actor ? 200 : 401 },
    );
    if (tokens) setUserCookies(response, tokens);
    else if (!actor) clearUserCookies(response);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service d’authentification est indisponible." },
      { status: 503 },
    );
  }
}
