import { createHmac } from "crypto";

const COOKIE_NAME = "jt_session";

// Derive a session token from APP_PASSWORD so changing the password
// invalidates all existing sessions automatically.
export function getExpectedToken(): string {
  const secret = process.env.APP_PASSWORD;
  if (!secret) throw new Error("APP_PASSWORD is not set");
  return createHmac("sha256", secret).update("job-tracker-session").digest("hex");
}

export function sessionCookie(token: string): string {
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export { COOKIE_NAME };
