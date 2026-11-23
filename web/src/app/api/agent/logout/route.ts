import { NextRequest, NextResponse } from "next/server";
import { clearAgentCookies } from "@/lib/agent-server";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

export async function POST(request: NextRequest) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const response = NextResponse.json({ ok: true });
  clearAgentCookies(response);
  return response;
}
