import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/google";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { USER_ID } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    return NextResponse.json(
      { error: "No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again." },
      { status: 400 }
    );
  }

  const encrypted = encrypt(tokens.refresh_token);

  await sql`
    insert into oauth_tokens (user_id, encrypted_refresh_token, scope, updated_at)
    values (${USER_ID}::uuid, ${encrypted}, ${tokens.scope ?? null}, now())
    on conflict (user_id) do update
      set encrypted_refresh_token = excluded.encrypted_refresh_token,
          scope = excluded.scope,
          updated_at = now()
  `;

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
