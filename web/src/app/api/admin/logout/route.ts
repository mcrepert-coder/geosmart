import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE,
} from "@/lib/admin-server";
import { rejectCrossSiteMutation } from "@/lib/request-guard";

export async function POST(request: NextRequest) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const response = NextResponse.json({ ok: true });
  const options = { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 };
  response.cookies.set(ADMIN_ACCESS_COOKIE, "", options);
  response.cookies.set(ADMIN_REFRESH_COOKIE, "", options);
  return response;
}
