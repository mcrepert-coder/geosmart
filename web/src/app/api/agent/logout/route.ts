import { NextResponse } from "next/server";
import { clearAgentCookies } from "@/lib/agent-server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAgentCookies(response);
  return response;
}
