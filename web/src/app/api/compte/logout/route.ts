import { NextRequest, NextResponse } from "next/server";
import { clearUserCookies } from "@/lib/account-server";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

export async function POST(request: NextRequest) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const response = NextResponse.json({ ok: true });
  clearUserCookies(response);
  return response;
}
