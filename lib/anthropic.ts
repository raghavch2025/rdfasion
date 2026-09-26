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
    category: { type: "string", enum: ["tshirt", "lower", "cargo", "jacket"] },
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
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
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
                "This is a shop photo of one men's garment from a wholesale manufacturer in Delhi (t-shirts, lowers/track pants, cargos, jackets). " +
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

// ---------------------------------------------------------------------------
// Auto-cataloguing a batch of photos (upload link / WhatsApp)
// ---------------------------------------------------------------------------

export type PhotoGroup = {
  existing_product_id: string;
  name: string;
  category: Category;
  print_type: "solid" | "print" | "stripe";
  photos: { photo: number; colour_name: string; colour_hex: string; is_model_photo: boolean }[];
};
export type Grouping = { groups: PhotoGroup[]; skipped: { photo: number; reason: string }[] };

const groupingSchema = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          existing_product_id: {
            type: "string",
            description: "id of the existing design these photos are more colours of, or empty string for a new design",
          },
          name: { type: "string", description: "2-5 plain English words, e.g. 'Boxy fit henley'" },
          category: { type: "string", enum: ["tshirt", "lower", "cargo", "jacket"] },
          print_type: { type: "string", enum: ["solid", "print", "stripe"] },
          photos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                photo: { type: "integer", description: "the new photo's number" },
                colour_name: { type: "string", description: "palette name when one is close, e.g. 'Olive' or 'Grey / Black' for two-tone" },
                colour_hex: { type: "string", description: "#RRGGBB of the main colour" },
                is_model_photo: {
                  type: "boolean",
                  description: "true if a person is wearing the garment in the photo; false for a flat, hanger or mannequin photo",
                },
              },
              required: ["photo", "colour_name", "colour_hex", "is_model_photo"],
              additionalProperties: false,
            },
          },
        },
        required: ["existing_product_id", "name", "category", "print_type", "photos"],
        additionalProperties: false,
      },
    },
    skipped: {
      type: "array",
      items: {
        type: "object",
        properties: { photo: { type: "integer" }, reason: { type: "string" } },
        required: ["photo", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups", "skipped"],
  additionalProperties: false,
} as const;

// Groups new photos into designs: the same design in another colour joins
// its design (a new one, or one already in the catalogue); a different
// design gets its own group. Returns null without an API key or on failure.
export async function groupPhotos(
  photos: { number: number; url: string; caption?: string | null }[],
  existing: { id: string; name: string; category: string; url: string }[],
  palette: string[],
): Promise<Grouping | null> {
  if (!serverEnv("ANTHROPIC_API_KEY") || photos.length === 0) return null;
  // Uploads run inside one serverless request: give up after 35 s (no retry)
  // and let the caller fall back to one design per photo.
  const client = new Anthropic({ timeout: 35_000, maxRetries: 0 });
  // Above 20 images per request each must be 2000 px or smaller; stay at 20.
  existing = existing.slice(0, Math.max(0, 20 - photos.length));
  photos = photos.slice(0, 20);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text:
        "You catalogue new stock for RD Fashion, a men's wholesale garment maker in Karol Bagh, Delhi (t-shirts, lowers, cargos, jackets). " +
        "The owner sent the new photos below, usually from WhatsApp. Group them into designs.\n" +
        "Rules:\n" +
        "- Photos of the same design (same cut, collar, placket, pockets, fabric and print layout) that differ only in colour belong to ONE group, one entry per colour.\n" +
        "- If a group is the same design as one of the EXISTING designs shown, set existing_product_id to that design's id so the colours are added to it. Otherwise leave it empty.\n" +
        "- A different design is a different group.\n" +
        "- Two photos of the same design in the same colour: keep the better one and list the other under skipped.\n" +
        "- A photo showing several colours of one design laid out together (a flat-lay): make that group from it once, listing each colour you can see, all with the same photo number.\n" +
        "- Skip photos that are not a garment for sale (screenshots of chats, price lists, people, blurry).\n" +
        `- Colour names: use this palette when one is close: ${palette.join(", ")}. Two-tone garments: "Body / Sleeve", e.g. "Grey / Black".\n` +
        "- Names: 2-5 plain English words a small retailer would use.",
    },
  ];
  if (existing.length) {
    content.push({ type: "text", text: "EXISTING designs in the catalogue:" });
    for (const e of existing) {
      content.push({ type: "text", text: `Existing design id=${e.id} · ${e.name} · ${e.category}` });
      content.push({ type: "image", source: { type: "url", url: e.url } });
    }
  }
  content.push({ type: "text", text: "NEW photos:" });
  for (const p of photos) {
    content.push({ type: "text", text: `Photo ${p.number}${p.caption ? ` (caption: ${p.caption.slice(0, 200)})` : ""}` });
    content.push({ type: "image", source: { type: "url", url: p.url } });
  }
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { effort: "low", format: betaJSONSchemaOutputFormat(groupingSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return null;
    return (response.parsed_output as Grouping | null) ?? null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error("Claude grouping failed", err.status, err.message);
    else console.error("Claude grouping failed", err);
    return null;
  }
}
