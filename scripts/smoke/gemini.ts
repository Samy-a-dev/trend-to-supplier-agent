import { z } from "zod";
import { listModels, generateJSON, generateImage, MODELS } from "../../lib/adapters/gemini";

export async function run(): Promise<void> {
  // 1) Deterministic model-id verification against the key.
  const models = await listModels();
  const names = models.map((m) => m.name ?? "").filter(Boolean);
  console.log(`  ${models.length} models available on key`);
  let missing = 0;
  for (const want of Object.values(MODELS)) {
    const found = names.some((n) => n.includes(want));
    if (!found) missing++;
    console.log(`    ${found ? "✓" : "✗"} ${want}`);
  }
  if (missing > 0) {
    console.log(`  (note: ${missing} planned id(s) not found verbatim — adjust MODELS to a listed id)`);
  }

  // 2) Structured JSON.
  const schema = z.object({ niches: z.array(z.string()).min(1) });
  const j = await generateJSON({
    prompt: "List 3 specific trending home-fitness product niches.",
    schema,
    model: MODELS.extract,
  });
  console.log(`  structured JSON: ${JSON.stringify(j)}`);

  // 3) Nano Banana image.
  const out = await generateImage({
    prompt: "Minimalist matte-black compact under-desk walking pad, clean studio product photo",
    outPath: "data/images/smoke.png",
    model: MODELS.imageFast,
    imageSize: "1K",
  });
  console.log(`  image saved: ${out}`);
}
