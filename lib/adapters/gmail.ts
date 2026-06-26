/** Gmail adapter — OAuth2 (refresh token) → create real drafts. Scope: gmail.compose. */
import { google } from "googleapis";
import { env } from "../env";

function oauthClient() {
  const { clientId, clientSecret, refreshToken } = env.google();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** RFC 2822 message → base64url (URL-safe, unpadded) as required by Gmail `raw`. */
export function buildRawMessage(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message, "utf-8").toString("base64url");
}

/**
 * Create a Gmail draft in the authenticated account. Returns the draft id.
 * Draft-only by design — the message lands in the Drafts folder and is never sent.
 */
export async function createDraft(
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth: oauthClient() });
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: buildRawMessage(to, subject, body) } },
  });
  return res.data.id ?? "";
}
