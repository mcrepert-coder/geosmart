import { NextResponse } from "next/server";
import { clearUserCookies } from "@/lib/account-server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearUserCookies(response);
  return response;
}
