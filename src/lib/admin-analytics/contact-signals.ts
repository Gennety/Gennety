const CONTACT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i, label: "email" },
  { re: /\b\+?\d[\d\s().-]{7,}\b/, label: "phone" },
  { re: /\b(?:telegram|tg|whatsapp|signal|discord|slack|calendly|zoom|meet)\b/i, label: "contact_channel" },
  { re: /\b(?:t\.me\/|wa\.me\/|linkedin\.com\/|calendly\.com\/|meet\.google\.com\/)\S*/i, label: "contact_link" },
  { re: /@\w{3,}/, label: "handle" },
];

export function extractContactSignals(text: string) {
  const labels = CONTACT_PATTERNS.filter(({ re }) => re.test(text)).map(({ label }) => label);
  return Array.from(new Set(labels));
}

export function hasContactExchangeSignal(text: string) {
  return extractContactSignals(text).length > 0;
}
