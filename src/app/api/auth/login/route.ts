import { NextRequest, NextResponse } from "next/server";
import { getExpectedToken, sessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = getExpectedToken();

  if (!password || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(expected));
  return res;
}
