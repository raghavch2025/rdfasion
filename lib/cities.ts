// Towns a Karol Bagh wholesale buyer is likely to come from, with Hindi names
// so buyers who read Devanagari (or neither script well) can spot theirs.
// The first entries double as the default one-tap buttons at checkout; the
// shop can change those buttons in /admin/settings (public.popular_cities).
export type City = { en: string; hi: string };

export const CITIES: City[] = [
  { en: "Delhi", hi: "दिल्ली" },
  { en: "Gurugram", hi: "गुरुग्राम" },
  { en: "Faridabad", hi: "फरीदाबाद" },
  { en: "Noida", hi: "नोएडा" },
  { en: "Ghaziabad", hi: "गाज़ियाबाद" },
  { en: "Meerut", hi: "मेरठ" },
  { en: "Sonipat", hi: "सोनीपत" },
  { en: "Panipat", hi: "पानीपत" },
  { en: "Rohtak", hi: "रोहतक" },
  { en: "Rewari", hi: "रेवाड़ी" },
  { en: "Karnal", hi: "करनाल" },
  { en: "Hisar", hi: "हिसार" },
  { en: "Jaipur", hi: "जयपुर" },
  { en: "Agra", hi: "आगरा" },
  { en: "Aligarh", hi: "अलीगढ़" },
  { en: "Ludhiana", hi: "लुधियाना" },
  { en: "Ambala", hi: "अंबाला" },
  { en: "Bahadurgarh", hi: "बहादुरगढ़" },
  { en: "Bhiwani", hi: "भिवानी" },
  { en: "Jhajjar", hi: "झज्जर" },
  { en: "Jind", hi: "जींद" },
  { en: "Kaithal", hi: "कैथल" },
  { en: "Kurukshetra", hi: "कुरुक्षेत्र" },
  { en: "Yamunanagar", hi: "यमुनानगर" },
  { en: "Sirsa", hi: "सिरसा" },
  { en: "Fatehabad", hi: "फतेहाबाद" },
  { en: "Narnaul", hi: "नारनौल" },
  { en: "Palwal", hi: "पलवल" },
  { en: "Hapur", hi: "हापुड़" },
  { en: "Bulandshahr", hi: "बुलंदशहर" },
  { en: "Muzaffarnagar", hi: "मुज़फ्फरनगर" },
  { en: "Saharanpur", hi: "सहारनपुर" },
  { en: "Moradabad", hi: "मुरादाबाद" },
  { en: "Bareilly", hi: "बरेली" },
  { en: "Mathura", hi: "मथुरा" },
  { en: "Firozabad", hi: "फ़िरोज़ाबाद" },
  { en: "Etawah", hi: "इटावा" },
  { en: "Kanpur", hi: "कानपुर" },
  { en: "Lucknow", hi: "लखनऊ" },
  { en: "Shahjahanpur", hi: "शाहजहाँपुर" },
  { en: "Rampur", hi: "रामपुर" },
  { en: "Badaun", hi: "बदायूँ" },
  { en: "Bijnor", hi: "बिजनौर" },
  { en: "Shamli", hi: "शामली" },
  { en: "Baghpat", hi: "बागपत" },
  { en: "Haridwar", hi: "हरिद्वार" },
  { en: "Dehradun", hi: "देहरादून" },
  { en: "Roorkee", hi: "रुड़की" },
  { en: "Haldwani", hi: "हल्द्वानी" },
  { en: "Rudrapur", hi: "रुद्रपुर" },
  { en: "Chandigarh", hi: "चंडीगढ़" },
  { en: "Patiala", hi: "पटियाला" },
  { en: "Amritsar", hi: "अमृतसर" },
  { en: "Jalandhar", hi: "जालंधर" },
  { en: "Bathinda", hi: "बठिंडा" },
  { en: "Shimla", hi: "शिमला" },
  { en: "Jammu", hi: "जम्मू" },
  { en: "Alwar", hi: "अलवर" },
  { en: "Bhiwadi", hi: "भिवाड़ी" },
  { en: "Ajmer", hi: "अजमेर" },
  { en: "Sikar", hi: "सीकर" },
  { en: "Jhunjhunu", hi: "झुंझुनू" },
  { en: "Bharatpur", hi: "भरतपुर" },
  { en: "Kota", hi: "कोटा" },
  { en: "Bikaner", hi: "बीकानेर" },
  { en: "Jodhpur", hi: "जोधपुर" },
  { en: "Udaipur", hi: "उदयपुर" },
  { en: "Sri Ganganagar", hi: "श्रीगंगानगर" },
  { en: "Gwalior", hi: "ग्वालियर" },
  { en: "Bhopal", hi: "भोपाल" },
  { en: "Indore", hi: "इंदौर" },
  { en: "Jhansi", hi: "झाँसी" },
  { en: "Prayagraj", hi: "प्रयागराज" },
  { en: "Varanasi", hi: "वाराणसी" },
  { en: "Gorakhpur", hi: "गोरखपुर" },
  { en: "Ayodhya", hi: "अयोध्या" },
  { en: "Patna", hi: "पटना" },
  { en: "Muzaffarpur", hi: "मुज़फ्फरपुर" },
  { en: "Darbhanga", hi: "दरभंगा" },
  { en: "Gaya", hi: "गया" },
  { en: "Ranchi", hi: "रांची" },
  { en: "Kolkata", hi: "कोलकाता" },
  { en: "Mumbai", hi: "मुंबई" },
  { en: "Ahmedabad", hi: "अहमदाबाद" },
  { en: "Surat", hi: "सूरत" },
];

export const DEFAULT_POPULAR_CITIES = CITIES.slice(0, 12).map((c) => c.en);

export function hindiName(en: string): string | undefined {
  return CITIES.find((c) => c.en.toLowerCase() === en.toLowerCase())?.hi;
}

// Matches English or Hindi, from the start of any word ("pat" finds Patna, Patiala).
export function searchCities(query: string, limit = 8): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CITIES.filter(
    (c) => c.en.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || c.en.toLowerCase().startsWith(q) || c.hi.startsWith(q),
  ).slice(0, limit);
}
