import { NextRequest, NextResponse } from "next/server";
import { getExpectedToken, COOKIE_NAME } from "@/lib/session";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard the dashboard
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();

  try {
    const expected = getExpectedToken();
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token === expected) return NextResponse.next();
  } catch {
    // APP_PASSWORD not set — fail open in dev, fail closed in prod
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
