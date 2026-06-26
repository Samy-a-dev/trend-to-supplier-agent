import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADK + the SDKs are server-only; keep them external to the bundle so their
  // Node built-ins and conditional ESM exports resolve at runtime.
  serverExternalPackages: [
    "@google/adk",
    "@google/genai",
    "apify-client",
    "@clickhouse/client",
    "googleapis",
  ],
};

export default nextConfig;
