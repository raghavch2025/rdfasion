// Cart and minimum-order rules shared by the browser and the server.
// One cart line = one design-colour; sizes map size -> pieces.

export type CartLine = {
  productId: string;
  slug: string;
  name: string;
  colorId: string;
  colorName: string;
  pricePerPiece: number;
  moq: number;
  sizeSet: string[];
  image: string | null;
  sizes: Record<string, number>;
};

export function linePieces(line: Pick<CartLine, "sizes">): number {
  return Object.values(line.sizes).reduce((sum, q) => sum + (q > 0 ? q : 0), 0);
}

export function lineAmount(line: Pick<CartLine, "sizes" | "pricePerPiece">): number {
  return linePieces(line) * line.pricePerPiece;
}

export function meetsMoq(line: Pick<CartLine, "sizes" | "moq">): boolean {
  return linePieces(line) >= line.moq;
}

export function cartTotals(lines: CartLine[]): { pieces: number; amount: number } {
  return lines.reduce(
    (t, l) => ({ pieces: t.pieces + linePieces(l), amount: t.amount + lineAmount(l) }),
    { pieces: 0, amount: 0 },
  );
}

export function cartCanSend(lines: CartLine[]): boolean {
  return lines.length > 0 && lines.every(meetsMoq);
}

// Sizes in the order the product lists them, zero quantities dropped.
export function orderedSizes(line: Pick<CartLine, "sizes" | "sizeSet">): [string, number][] {
  const known = line.sizeSet.filter((s) => (line.sizes[s] ?? 0) > 0);
  const extra = Object.keys(line.sizes).filter((s) => !line.sizeSet.includes(s) && line.sizes[s] > 0);
  return [...known, ...extra].map((s) => [s, line.sizes[s]]);
}

// Adds or replaces the line for a design-colour.
export function upsertLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.colorId === line.colorId);
  if (i === -1) return [...lines, line];
  const next = lines.slice();
  next[i] = line;
  return next;
}

export function setQty(lines: CartLine[], colorId: string, size: string, qty: number): CartLine[] {
  return lines.map((l) =>
    l.colorId === colorId ? { ...l, sizes: { ...l.sizes, [size]: Math.max(0, Math.min(999, qty)) } } : l,
  );
}

export function removeLine(lines: CartLine[], colorId: string): CartLine[] {
  return lines.filter((l) => l.colorId !== colorId);
}
