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

// Storage paths coming back from the browser must be exactly the ones the
// server handed out: "uploads/<batch uuid>/<nn>-<6 chars>.jpg". Anything else
// (e.g. "../" segments) could make a service-role storage call reach other
// objects or other Supabase endpoints.
export function isIssuedUploadPath(path: string, batchId: string): boolean {
  if (!/^[0-9a-f-]{36}$/.test(batchId)) return false;
  return new RegExp(`^uploads/${batchId}/\\d{2}-[a-z0-9]{1,8}\\.jpg$`).test(path);
}
