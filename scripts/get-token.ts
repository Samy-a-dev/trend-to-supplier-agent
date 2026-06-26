/**
 * One-time Gmail OAuth consent (loopback flow) → prints GOOGLE_REFRESH_TOKEN.
 * Prereqs: a "Desktop app" OAuth client in Google Cloud, with your account added as
 * a Test User, and GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET set in .env.local.
 *
 *   pnpm get-token   → open the printed URL, approve, copy the token into .env.local
 */
import "../lib/env"; // loads .env.local
import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline", // required to receive a refresh token
  prompt: "consent", // force a fresh refresh token even if a grant exists
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const code = new URL(req.url ?? "", REDIRECT_URI).searchParams.get("code");
    if (!code) {
      res.end("No authorization code in callback.");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.end("Done — you can close this tab and return to the terminal.");
    console.log("\n✅ Add this to .env.local:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    server.close();
    process.exit(0);
  } catch (e) {
    res.end("Error exchanging code: " + String(e));
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
});
