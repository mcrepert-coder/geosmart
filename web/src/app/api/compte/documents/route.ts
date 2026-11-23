import { NextRequest, NextResponse } from "next/server";
import { fetchApi, refreshAdminTokens } from "@/lib/admin-server";
import { setUserCookies, userAccessToken } from "@/lib/account-server";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

// Relais de /accounts/me/documents (contracts/auth.yaml, EF-403) : liste et
// depot des pieces justificatives du compte connecte.

async function proxy(request: NextRequest) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  try {
    const session = await userAccessToken();
    let tokens = session.tokens;
    if (!session.accessToken) {
      return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
    }
    const contentType = request.headers.get("content-type");
    const body =
      request.method === "POST" ? Buffer.from(await request.arrayBuffer()) : undefined;
    const init: RequestInit = {
      method: request.method,
      headers: body && contentType ? { "Content-Type": contentType } : undefined,
      body,
    };
    let upstream = await fetchApi("/accounts/me/documents", init, session.accessToken);
    if (upstream.status === 401 && session.refreshToken && !tokens) {
      tokens = await refreshAdminTokens(session.refreshToken);
      if (tokens) upstream = await fetchApi("/accounts/me/documents", init, tokens.accessToken);
    }
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    if (tokens) setUserCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Le service des pièces justificatives est indisponible." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
