/**
 * Central env access. Lazy getters throw a clear error only when an integration
 * is actually used, so a missing key for one service doesn't block the others.
 *
 * Loads `.env.local` (then `.env`) for standalone `tsx` scripts; under Next.js the
 * vars are already present, so this is a harmless no-op there.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var ${name}. Add it to .env.local (see .env.local.example).`);
  }
  return v.trim();
}

function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  apifyToken: () => req("APIFY_TOKEN"),
  tavilyApiKey: () => req("TAVILY_API_KEY"),
  clickhouse: () => ({
    url: req("CLICKHOUSE_URL"),
    username: opt("CLICKHOUSE_USER", "default"),
    password: req("CLICKHOUSE_PASSWORD"),
  }),
  geminiApiKey: () => req("GEMINI_API_KEY"),
  prometheux: () => ({
    token: req("PMTX_TOKEN"),
    org: req("PMTX_ORG"),
    user: req("PMTX_USER"),
  }),
  sidecarUrl: () => opt("SIDECAR_URL", "http://localhost:8000"),
  google: () => ({
    clientId: req("GOOGLE_CLIENT_ID"),
    clientSecret: req("GOOGLE_CLIENT_SECRET"),
    refreshToken: req("GOOGLE_REFRESH_TOKEN"),
  }),
};
