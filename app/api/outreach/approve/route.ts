/** Approve an RFQ draft → create a real Gmail draft (never sent) + update status. */
export const runtime = "nodejs";

import path from "node:path";
import { readFile } from "node:fs/promises";
import { createDraft, type GmailDraftImage } from "@/lib/adapters/gmail";
import { getOpportunity, getOutreach, setOutreachDrafted } from "@/lib/db/store";

const GENERATED_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated");
const MIME_BY_EXT: Record<string, GmailDraftImage["mimeType"]> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function extractImagePaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function persistedImagePaths(runId: string): Promise<string[]> {
  const rows = await getOpportunity(runId);
  const row = rows[0];
  const direct = extractImagePaths(row?.image_paths);
  if (direct.length > 0) return direct;

  if (typeof row?.payload !== "string") return [];
  try {
    const payload = JSON.parse(row.payload) as { variant?: { imagePaths?: unknown } };
    return extractImagePaths(payload.variant?.imagePaths);
  } catch {
    return [];
  }
}

function generatedFilePath(publicPath: string): { fullPath?: string; skipped?: string } {
  const value = publicPath.trim().split(/[?#]/, 1)[0] ?? "";
  const prefix = value.startsWith("/generated/")
    ? "/generated/"
    : value.startsWith("generated/")
      ? "generated/"
      : value.startsWith("public/generated/")
        ? "public/generated/"
        : "";
  if (!prefix) return { skipped: `${publicPath}: not a generated image path` };

  let relative = value.slice(prefix.length);
  try {
    relative = decodeURIComponent(relative);
  } catch {
    return { skipped: `${publicPath}: invalid path encoding` };
  }

  const normalized = path.normalize(relative);
  if (!normalized || normalized === "." || normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return { skipped: `${publicPath}: path is outside public/generated` };
  }

  const fullPath = path.join(GENERATED_DIR, normalized);
  if (fullPath !== GENERATED_DIR && !fullPath.startsWith(`${GENERATED_DIR}${path.sep}`)) {
    return { skipped: `${publicPath}: path is outside public/generated` };
  }
  return { fullPath };
}

async function loadDraftImages(imagePaths: string[]): Promise<{ images: GmailDraftImage[]; skippedImages: string[] }> {
  const seen = new Set<string>();
  const images: GmailDraftImage[] = [];
  const skippedImages: string[] = [];

  for (const imagePath of imagePaths) {
    if (seen.has(imagePath)) continue;
    seen.add(imagePath);

    const resolved = generatedFilePath(imagePath);
    if (!resolved.fullPath) {
      skippedImages.push(resolved.skipped ?? `${imagePath}: invalid path`);
      continue;
    }

    const ext = path.extname(resolved.fullPath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      skippedImages.push(`${imagePath}: unsupported image type`);
      continue;
    }

    try {
      images.push({
        filename: path.basename(resolved.fullPath),
        mimeType,
        content: await readFile(/* turbopackIgnore: true */ resolved.fullPath),
      });
    } catch (e) {
      skippedImages.push(`${imagePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { images, skippedImages };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runId?: string; id?: string; imagePaths?: unknown };
  const runId = (body.runId ?? "").trim();
  const id = (body.id ?? "").trim();
  if (!runId || !id) return Response.json({ error: "runId and id required" }, { status: 400 });

  try {
    const emails = await getOutreach(runId);
    const email = emails.find((e) => e.id === id);
    if (!email) return Response.json({ error: "email not found" }, { status: 404 });

    const requestedPaths = extractImagePaths(body.imagePaths);
    const imagePaths = requestedPaths.length > 0 ? requestedPaths : await persistedImagePaths(runId);
    const { images, skippedImages } = await loadDraftImages(imagePaths);

    const draftId = await createDraft(
      email.to_email || "supplier@example.com",
      email.subject,
      email.body,
      { images },
    );
    await setOutreachDrafted(runId, id, draftId);
    return Response.json({ ok: true, draftId, imageCount: images.length, skippedImages });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
