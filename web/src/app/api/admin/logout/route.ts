import { NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE,
} from "@/lib/admin-server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const options = { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 };
  response.cookies.set(ADMIN_ACCESS_COOKIE, "", options);
  response.cookies.set(ADMIN_REFRESH_COOKIE, "", options);
  return response;
}
