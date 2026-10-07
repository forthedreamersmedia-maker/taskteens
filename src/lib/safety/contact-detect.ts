/**
 * Client-side preview of the database's off-platform contact detection (supabase send_message).
 * Used only to WARN before sending; the database makes the real decision. Pattern matching
 * cannot catch every variation.
 */
const WORD_DIGITS: Record<string, string> = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };

export interface ContactCheck { blocked: string[]; flagged: string[] }

export function checkContact(text: string, { addressAllowed = false } = {}): ContactCheck {
  const t = text.toLowerCase();
  const squashed = t.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORD_DIGITS[w]!).replace(/[\s.,;:\-()_/\\|+*]+/g, "");
  const blocked: string[] = [];
  const flagged: string[] = [];
  if (/\d{10,11}/.test(squashed) || /\d{3}[\s.-]*\d{3}[\s.-]*\d{4}/.test(t)) blocked.push("a phone number");
  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*(com|net|org|edu|io|co|us|me)\b/.test(t)) blocked.push("an email address");
  if (/(^|\s)@[a-z0-9_.]{3,30}/.test(t)) blocked.push("a social media handle");
  if (!addressAllowed && /\d{2,5}\s+[a-z0-9 ]{2,30}\s(st|street|ave|avenue|rd|road|blvd|way|dr|drive|ct|court|ln|lane|pl|place|ter|terrace)\b/.test(t)) blocked.push("a street address");
  if (/\b(instagram|insta|ig|snapchat|snap|sc|tiktok|telegram|whatsapp|wechat|weixin|discord|signal|kik|messenger|facebook|fb|imessage|facetime|venmo|cash ?app|zelle)\b/.test(t)) flagged.push("another app or platform");
  if (/\b(text|call|dm|message|hit|reach|contact|find|add|follow) (me|us)\b/.test(t) || /\b(outside|off) (of )?(the )?(app|site|platform|taskteens)\b/.test(t) || /\bmy (number|cell|phone|insta|snap|handle|email)\b/.test(t)) flagged.push("moving the conversation off TaskTeens");
  return { blocked, flagged };
}
