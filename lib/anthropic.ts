import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { serverEnv } from "./env.ts";
import type { Category } from "./types.ts";

export type GarmentGuess = {
  name: string;
  category: Category;
  colour: string;
  fit: string;
  print_type: "solid" | "print" | "stripe";
};

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short catalogue name, e.g. 'Boxy fit henley tee'" },
    category: { type: "string", enum: ["tshirt", "lower", "cargo"] },
    colour: { type: "string", description: "Main garment colour, using a palette name when one fits" },
    fit: { type: "string", description: "Fit words such as boxy, regular, oversized, slim" },
    print_type: { type: "string", enum: ["solid", "print", "stripe"] },
  },
  required: ["name", "category", "colour", "fit", "print_type"],
  additionalProperties: false,
} as const;

// Claude vision call on the original photo; pre-fills the publish form.
// Returns null when the API key is missing or the call fails; the admin then types.
export async function analyseGarment(imageUrl: string, palette: string[]): Promise<GarmentGuess | null> {
  if (!serverEnv("ANTHROPIC_API_KEY")) return null;
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "low", format: betaJSONSchemaOutputFormat(schema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text:
                "This is a shop photo of one men's garment from a wholesale manufacturer in Delhi (t-shirts, lowers/track pants, cargos). " +
                "Describe it for the catalogue. The name should be 2-5 plain English words a small retailer would use. " +
                `Pick the colour from this palette when one is close: ${palette.join(", ")}.`,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output ?? null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error("Claude auto-fill failed", err.status, err.message);
    else console.error("Claude auto-fill failed", err);
    return null;
  }
}
