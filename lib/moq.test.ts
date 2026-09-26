import { test } from "node:test";
import assert from "node:assert/strict";
import { cartCanSend, cartTotals, meetsMoq, orderedSizes, setQty, upsertLine, type CartLine } from "./moq.ts";
import { groupIndian, isValidPhone, normalizePhone, rupees } from "./format.ts";
import { buildOrderMessage, waUrl } from "./whatsapp.ts";

const line = (colorId: string, sizes: Record<string, number>, price = 260): CartLine => ({
  productId: "p", slug: "s", name: "Tee", colorId, colorName: "Olive", pricePerPiece: price,
  moq: 6, sizeSet: ["M", "L", "XL", "XXL"], image: null, sizes,
});

test("MOQ blocks 5 pieces and allows 6", () => {
  assert.equal(meetsMoq(line("a", { M: 2, L: 3 })), false);
  assert.equal(meetsMoq(line("a", { M: 2, L: 3, XL: 1 })), true);
});

test("cart sends only when every design-colour line has 6+", () => {
  const ok = line("a", { M: 6 });
  const short = line("b", { L: 5 });
  assert.equal(cartCanSend([ok]), true);
  assert.equal(cartCanSend([ok, short]), false);
  assert.equal(cartCanSend([]), false);
  assert.equal(cartCanSend(setQty([ok, short], "b", "XL", 1)), true);
});

test("totals, upsert and size order", () => {
  const lines = upsertLine([line("a", { XL: 2, M: 2, L: 2 })], line("b", { L: 3, XL: 3 }, 480));
  assert.deepEqual(cartTotals(lines), { pieces: 12, amount: 4440 });
  assert.deepEqual(orderedSizes(lines[0]), [["M", 2], ["L", 2], ["XL", 2]]);
  assert.equal(upsertLine(lines, line("a", { M: 7 })).length, 2);
});

test("Indian grouping and phone rules", () => {
  assert.equal(rupees(4440), "₹4,440");
  assert.equal(groupIndian(123456), "1,23,456");
  assert.equal(groupIndian(999), "999");
  assert.equal(isValidPhone("981234561"), false);
  assert.equal(isValidPhone("9812345612"), true);
  assert.equal(normalizePhone("+91 98123-45612"), "9812345612");
});

test("WhatsApp message matches the PRD format", () => {
  const msg = buildOrderMessage({
    code: "RD-1042", shopName: "Sharma Garments", city: "Rewari", name: "Rakesh Sharma", phone: "9812345612",
    siteHost: "rdfashion.in",
    lines: [
      { name: "Boxy fit henley tee", colorName: "Olive", pricePerPiece: 260, sizes: [["M", 2], ["L", 2], ["XL", 2]] },
      { name: "Cargo jogger", colorName: "Black", pricePerPiece: 480, sizes: [["L", 3], ["XL", 3]] },
    ],
  });
  assert.equal(msg, [
    "Order RD-1042 | RD Fashion",
    "Dukaan: Sharma Garments, Rewari",
    "Naam: Rakesh Sharma | 9812345612",
    "",
    "1. Boxy fit henley tee - Olive",
    "   M x2, L x2, XL x2 = 6 pcs @ 260 = 1,560",
    "2. Cargo jogger - Black",
    "   L x3, XL x3 = 6 pcs @ 480 = 2,880",
    "",
    "Total: 12 pcs | Rs 4,440",
    "Order dekhein: rdfashion.in/o/RD-1042",
  ].join("\n"));
  assert.ok(msg.length < 1000);
  assert.ok(waUrl("919313877748", msg).startsWith("https://wa.me/919313877748?text=Order%20RD-1042"));
});
