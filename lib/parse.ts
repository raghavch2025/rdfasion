// Pure helpers shared by uploads and tests.

// "Rate 300", "rate-300", "₹ 280", "Rs.450", "300/-" or a bare "280".
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const m =
    text.match(/(?:rate|price|₹|rs\.?|inr)\s*[-:=]?\s*(\d{2,5})/i) ??
    text.match(/\b(\d{2,5})\s*(?:\/-|rs|₹|rupees?)/i) ??
    text.trim().match(/^(\d{2,5})$/);
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  return n >= 20 && n <= 50000 ? n : null;
}
