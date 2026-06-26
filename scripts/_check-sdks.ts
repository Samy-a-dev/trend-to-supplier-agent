/* Sanity-check that the SDK surfaces we plan to use actually exist. No network. */
import * as adk from "@google/adk";
import * as genai from "@google/genai";

const adkExports = [
  "BaseAgent",
  "LlmAgent",
  "SequentialAgent",
  "Runner",
  "InMemoryRunner",
  "InMemorySessionService",
  "createEvent",
  "createEventActions",
  "StreamingMode",
] as const;

const genaiExports = ["GoogleGenAI", "Type"] as const;

console.log("— @google/adk —");
for (const k of adkExports) {
  console.log(`  ${k}: ${typeof (adk as Record<string, unknown>)[k]}`);
}
console.log("— @google/genai —");
for (const k of genaiExports) {
  console.log(`  ${k}: ${typeof (genai as Record<string, unknown>)[k]}`);
}
console.log("StreamingMode values:", JSON.stringify((adk as Record<string, unknown>).StreamingMode));
