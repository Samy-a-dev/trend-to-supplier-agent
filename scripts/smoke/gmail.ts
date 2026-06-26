import path from "node:path";
import { readFile } from "node:fs/promises";
import { createDraft, type GmailDraftImage } from "../../lib/adapters/gmail";

const MIME_BY_EXT: Record<string, GmailDraftImage["mimeType"]> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function loadSmokeImage(): Promise<GmailDraftImage[]> {
  const imagePath = process.env.SMOKE_IMAGE_PATH?.trim();
  if (!imagePath) return [];

  const fullPath = path.resolve(imagePath);
  const mimeType = MIME_BY_EXT[path.extname(fullPath).toLowerCase()];
  if (!mimeType) throw new Error(`SMOKE_IMAGE_PATH must be a PNG, JPG, JPEG, or WebP file: ${imagePath}`);

  return [
    {
      filename: path.basename(fullPath),
      mimeType,
      content: await readFile(fullPath),
    },
  ];
}

export async function run(): Promise<void> {
  const to = process.env.SMOKE_EMAIL_TO || "supplier@example.com";
  const images = await loadSmokeImage();
  const id = await createDraft(
    to,
    "Sourcing Agent — smoke test draft",
    "This is a draft created by the sourcing agent smoke test. It was not sent.",
    { images },
  );
  console.log(`  created Gmail draft id: ${id} with ${images.length} image(s) (stays in Drafts, not sent)`);
  if (!id) throw new Error("drafts.create returned no id");
}
