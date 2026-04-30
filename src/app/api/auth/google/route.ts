import { NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/google";

export function GET() {
  const client = getOAuthClient();

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    // Force consent screen every time so Google always returns a refresh token
    prompt: "consent",
  });

  return NextResponse.redirect(url);
}
