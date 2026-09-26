import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parsePrice } from "./parse.ts";
import { parseWebhook, validSignature } from "./whatsapp-parse.ts";
import { searchCities } from "./cities.ts";

test("rate from captions and texts", () => {
  assert.equal(parsePrice("Boxy fit henley Rate-300 Size-M-XL"), 300);
  assert.equal(parsePrice("rate 280"), 280);
  assert.equal(parsePrice("₹ 450"), 450);
  assert.equal(parsePrice("Rs.520 only"), 520);
  assert.equal(parsePrice("350/-"), 350);
  assert.equal(parsePrice("280"), 280);
  assert.equal(parsePrice("Contact-9313877748"), null);
  assert.equal(parsePrice("Moq-12 pcs"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("rate 5"), null);
});

test("WhatsApp signature is checked on the raw bytes", () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account","entry":[{"x":"\\u0939\\u093f"}]}');
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(raw).digest("hex");
  assert.equal(validSignature(raw, sig, "s3cret"), true);
  assert.equal(validSignature(raw, sig, "other"), false);
  assert.equal(validSignature(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), sig, "s3cret"), false);
  assert.equal(validSignature(raw, null, "s3cret"), false);
});

test("WhatsApp payload: photos, photo-as-document, text; statuses ignored", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "106540352242922" },
              messages: [
                { id: "wamid.2", from: "919313877748", timestamp: "20", type: "text", text: { body: " done " } },
                { id: "wamid.1", from: "919313877748", timestamp: "10", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "rate 300" } },
                { id: "wamid.3", from: "919313877748", timestamp: "15", type: "document", document: { id: "m2", mime_type: "image/png" } },
                { id: "wamid.4", from: "919313877748", timestamp: "16", type: "document", document: { id: "m3", mime_type: "application/pdf" } },
              ],
            },
          },
          { field: "messages", value: { statuses: [{ id: "wamid.out", status: "read" }] } },
        ],
      },
    ],
  };
  const msgs = parseWebhook(body as never);
  assert.deepEqual(msgs.map((m) => [m.id, m.type]), [["wamid.1", "image"], ["wamid.3", "image"], ["wamid.4", "other"], ["wamid.2", "text"]]);
  assert.equal(msgs[0].caption, "rate 300");
  assert.equal(msgs[0].phoneNumberId, "106540352242922");
  assert.equal(msgs[3].text, "done");
  assert.deepEqual(parseWebhook({ object: "page" } as never), []);
});

test("city search matches English and Hindi", () => {
  assert.deepEqual(searchCities("roh").map((c) => c.en), ["Rohtak"]);
  assert.ok(searchCities("पटना").some((c) => c.en === "Patna"));
  assert.ok(searchCities("pat").map((c) => c.en).includes("Patiala"));
  assert.deepEqual(searchCities(""), []);
});
