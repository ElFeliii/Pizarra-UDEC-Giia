const TLDS =
  'com|cl|net|org|io|ly|gg|me|co|xyz|app|dev|info|tk|ru|es|ar|pe|mx|link|site|online|store|tv|live|ws|to|club|shop|top|biz|us|uk';

const LINK_PATTERNS = [
  /(https?:\/\/|www\.)/i,
  new RegExp(`\\b[a-z0-9-]+\\s?(?:\\.|\\[\\.\\]|\\(\\.\\))\\s?(?:${TLDS})\\b`, 'i'),
];

const PERSONAL_PATTERNS = [
  // Email
  /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/i,
  // Celular chileno: +56 9 1234 5678, 912345678, 9-1234-5678
  /(?:\+?56[\s.-]?)?\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/,
  // RUT: 12.345.678-9 / 12345678-k
  /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/,
  // Cualquier secuencia de 8+ dígitos (con . o - entre medio)
  /\d(?:[.-]?\d){7,}/,
];

export type ContentRuleViolation = 'LINKS' | 'PERSONAL_DATA';

/** Reglas de contenido independientes de la lista de palabras. Recibe texto ya sanitizado. */
export function checkContentRules(text: string): ContentRuleViolation | null {
  // Primero datos personales: un email también calza con el patrón de dominio.
  if (PERSONAL_PATTERNS.some((re) => re.test(text))) return 'PERSONAL_DATA';
  if (LINK_PATTERNS.some((re) => re.test(text))) return 'LINKS';
  return null;
}
