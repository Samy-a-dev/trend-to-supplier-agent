/**
 * Gemini adapter (`@google/genai`) — structured JSON generation, Nano Banana image
 * generation, and a models.list() verifier. Model ids per the approved plan; the M0
 * smoke test confirms they exist on the key via listModels().
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { env } from "../env";

let _ai: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return _ai;
}

export const MODELS = {
  reason: "gemini-3.1-pro-preview",
  extract: "gemini-3.5-flash",
  bulk: "gemini-3.1-flash-lite",
  imagePro: "gemini-3-pro-image",
  imageFast: "gemini-3.1-flash-image",
} as const;

type ThinkingLevel = "low" | "medium" | "high";

/**
 * Gemini's responseJsonSchema accepts a subset of JSON Schema (type/enum/properties/
 * items/required). Strip meta keywords and unsupported numeric/length/format
 * constraints that z.toJSONSchema emits — Zod still validates the parsed result.
 */
const DROP_KEYS = new Set([
  "$schema",
  "$id",
  "$ref",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "additionalProperties",
]);

function sanitizeJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeJsonSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = sanitizeJsonSchema(v);
    }
    return out;
  }
  return schema;
}

/** Generate strict JSON validated against a Zod schema, with one repair retry. */
export async function generateJSON<T>(opts: {
  prompt: string;
  schema: z.ZodType<T>;
  model?: string;
  thinking?: ThinkingLevel;
  system?: string;
}): Promise<T> {
  const { prompt, schema, model = MODELS.extract, thinking, system } = opts;
  const jsonSchema = sanitizeJsonSchema(z.toJSONSchema(schema));

  const call = async (extra: string): Promise<T> => {
    const config: Record<string, unknown> = {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    };
    if (thinking) config.thinkingConfig = { thinkingLevel: thinking };
    if (system) config.systemInstruction = system;

    const res = await gemini().models.generateContent({
      model,
      contents: prompt + extra,
      config,
    });
    const text = res.text ?? "";
    return schema.parse(JSON.parse(text));
  };

  try {
    return await call("");
  } catch {
    // Repair retry: re-prompt for strictly valid JSON.
    return await call(
      "\n\nReturn ONLY a single JSON value that strictly matches the required schema. No prose, no markdown fences.",
    );
  }
}

/** Generate one image and write it to `outPath`. Returns the path written. */
export async function generateImage(opts: {
  prompt: string;
  outPath: string;
  model?: string;
  inputImages?: { mimeType: string; dataBase64: string }[];
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
}): Promise<string> {
  const {
    prompt,
    outPath,
    model = MODELS.imagePro,
    inputImages = [],
    aspectRatio = "1:1",
    imageSize = "2K",
  } = opts;

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of inputImages) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }

  const res = await gemini().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: { imageConfig: { aspectRatio, imageSize } },
  });

  const EXT: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  };
  const candidateParts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of candidateParts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data) {
      const ext = EXT[inline.mimeType ?? "image/png"] ?? ".png";
      const finalPath = outPath.replace(/\.[a-z0-9]+$/i, ext);
      await writeFile(finalPath, Buffer.from(inline.data, "base64"));
      return finalPath; // actual path written (extension matches the real mime type)
    }
  }
  throw new Error(`No image returned by ${model}.`);
}

export type ModelInfo = { name?: string; displayName?: string; supportedActions?: string[] };

/** List models available on the key — the deterministic id verifier for M0. */
export async function listModels(): Promise<ModelInfo[]> {
  const out: ModelInfo[] = [];
  const pager = await gemini().models.list({ config: { pageSize: 50 } });
  for await (const m of pager) {
    const mm = m as ModelInfo;
    out.push({ name: mm.name, displayName: mm.displayName, supportedActions: mm.supportedActions });
  }
  return out;
}
