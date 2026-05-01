import { google } from "googleapis";
import { getOAuthClient } from "./google";
import { decrypt } from "./crypto";
import { sql } from "./db";
import { USER_ID } from "./constants";

async function getGmailClient() {
  const rows = await sql`
    select encrypted_refresh_token from oauth_tokens where user_id = ${USER_ID}::uuid
  `;
  if (rows.length === 0) {
    throw new Error("No OAuth token found — complete Google auth at /api/auth/google first.");
  }
  const refreshToken = decrypt(rows[0].encrypted_refresh_token as string);
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: client });
}

export interface RawMessage {
  id: string;
  threadId: string;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
  snippet: string;
  body: string;
}

export async function fetchNewMessages(since: Date | null): Promise<RawMessage[]> {
  const gmail = await getGmailClient();

  let q = "in:inbox category:primary";
  if (since) {
    // Gmail after: filter uses YYYY/MM/DD
    const dateStr = since.toISOString().split("T")[0].replace(/-/g, "/");
    q += ` after:${dateStr}`;
  } else {
    q += " newer_than:30d";
  }

  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 100,
      pageToken,
    });
    for (const msg of res.data.messages ?? []) {
      if (msg.id) messageIds.push(msg.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const messages: RawMessage[] = [];
  for (const id of messageIds) {
    try {
      const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const parsed = parseMessage(res.data);
      if (parsed) messages.push(parsed);
    } catch {
      // Skip individual fetch failures — logged at the sync level
    }
  }
  return messages;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMessage(msg: any): RawMessage | null {
  if (!msg.id || !msg.threadId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    id: msg.id,
    threadId: msg.threadId,
    fromAddress: h("from"),
    subject: h("subject"),
    receivedAt: new Date(h("date") || Number(msg.internalDate)),
    snippet: msg.snippet ?? "",
    body: extractBody(msg.payload),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data as string, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data as string, "base64url").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(Buffer.from(part.body.data as string, "base64url").toString("utf-8"));
      }
    }
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
