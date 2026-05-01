import { NextResponse } from "next/server";
import { clearCookie } from "@/lib/session";

export function GET() {
  const res = NextResponse.redirect("/login");
  res.headers.set("Set-Cookie", clearCookie());
  return res;
}
