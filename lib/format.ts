// Rupees with Indian digit grouping: 4440 -> "₹4,440", 123456 -> "₹1,23,456".
export function groupIndian(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function rupees(n: number): string {
  return `₹${groupIndian(n)}`;
}

export function pcs(n: number): string {
  return `${n} pcs`;
}

// Keep only the 10-digit Indian mobile number: "+91 93138-77748" -> "9313877748".
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input)) && input.replace(/\D/g, "").length >= 10;
}

export function maskPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 2)}xxxxxx${phone.slice(8)}` : phone;
}
