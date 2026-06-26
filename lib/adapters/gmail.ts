/** Gmail adapter — OAuth2 (refresh token) → create real drafts. Scope: gmail.compose. */
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { env } from "../env";

export type GmailDraftImage = {
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  content: Buffer;
};

export type CreateDraftOptions = {
  images?: GmailDraftImage[];
};

function oauthClient() {
  const { clientId, clientSecret, refreshToken } = env.google();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeaderValue(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf-8").toString("base64")}?=`;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\r\n"\\]+/g, "_").trim() || "concept-image";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function foldBase64(data: Buffer | string): string {
  const base64 = Buffer.isBuffer(data)
    ? data.toString("base64")
    : Buffer.from(data, "utf-8").toString("base64");
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function buildHtmlBody(body: string, images: { filename: string; cid: string }[]): string {
  const text = escapeHtml(body).replace(/\r?\n/g, "<br />\n");
  const figures = images
    .map(
      (img) =>
        `<figure style="margin: 18px 0;">` +
        `<img src="cid:${escapeHtml(img.cid)}" alt="${escapeHtml(img.filename)}" ` +
        `style="display:block;max-width:560px;width:100%;height:auto;border:0;" />` +
        `<figcaption style="margin-top:6px;color:#666;font-size:12px;">${escapeHtml(img.filename)}</figcaption>` +
        `</figure>`,
    )
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<body>",
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;">${text}</div>`,
    images.length > 0
      ? `<h2 style="font-family:Arial,sans-serif;font-size:16px;margin:24px 0 10px;">Concept images</h2>`
      : "",
    figures,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}

function textBodyWithImageList(body: string, images: GmailDraftImage[]): string {
  if (images.length === 0) return body;
  const filenames = images.map((img) => `- ${img.filename}`).join("\r\n");
  return `${body}\r\n\r\nConcept images included inline:\r\n${filenames}`;
}

/** RFC 2822 message → base64url (URL-safe, unpadded) as required by Gmail `raw`. */
export function buildRawMessage(
  to: string,
  subject: string,
  body: string,
  options: CreateDraftOptions = {},
): string {
  const images = options.images ?? [];
  const baseHeaders = [
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
  ];

  if (images.length === 0) {
    const message = [
      ...baseHeaders,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n");
    return Buffer.from(message, "utf-8").toString("base64url");
  }

  const boundarySeed = randomUUID();
  const relatedBoundary = `related_${boundarySeed}`;
  const alternativeBoundary = `alternative_${boundarySeed}`;
  const imageRefs = images.map((img, i) => ({
    image: img,
    filename: sanitizeFilename(img.filename),
    cid: `concept-${i}-${boundarySeed}@sourcing-agent.local`,
  }));
  const plainTextImages = imageRefs.map((ref) => ({ ...ref.image, filename: ref.filename }));
  const htmlImages = imageRefs.map((ref) => ({ filename: ref.filename, cid: ref.cid }));

  const message = [
    ...baseHeaders,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(textBodyWithImageList(body, plainTextImages)),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(buildHtmlBody(body, htmlImages)),
    `--${alternativeBoundary}--`,
    ...imageRefs.flatMap((ref) => [
      `--${relatedBoundary}`,
      `Content-Type: ${ref.image.mimeType}; name="${ref.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${ref.cid}>`,
      `Content-Disposition: inline; filename="${ref.filename}"`,
      "",
      foldBase64(ref.image.content),
    ]),
    `--${relatedBoundary}--`,
    "",
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
  options: CreateDraftOptions = {},
): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth: oauthClient() });
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: buildRawMessage(to, subject, body, options) } },
  });
  return res.data.id ?? "";
}
