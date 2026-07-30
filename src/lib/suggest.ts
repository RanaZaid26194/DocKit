// Turning a sample document into rule suggestions.
//
// The old version just counted single words and handed back the six most
// frequent ones, which produced junk like "county" or "issued" and missed
// the phrases that actually identify a document type ("social security
// administration", "pay period"). This version combines three signals:
//
//   1. **Phrase mining** — unigrams AND bigrams, scored by frequency x a
//      distinctiveness weight that penalizes generic paperwork vocabulary.
//   2. **Header bias** — tokens in the first ~15% of the recognized text
//      (the letterhead / title block) count triple, because that's where a
//      document announces what it is.
//   3. **Structure detection** — regex probes for dollar amounts, dates,
//      SSNs, expiry wording, account numbers. These become `hasFields` /
//      `recentWithin` / `notExpired` suggestions rather than keywords.
//
// Everything is a *suggestion*. The manager edits the list by hand before
// saving; nothing is applied automatically.

import type { RuleSpec } from "./rules/engine";

const GENERIC = new Set([
  "the","and","for","that","this","with","from","have","are","was","were","you","your","not","but",
  "all","can","will","any","one","two","three","four","five","page","form","please","see","use",
  "www","http","https","com","org","gov","date","dated","name","address","city","state","zip",
  "phone","number","print","sign","signature","total","amount","information","office","department",
  "please","note","copy","original","valid","issue","issued","under","over","per","new","old","first",
  "last","full","street","apt","suite","email","fax","attn","dear","sincerely","thank","thanks",
]);

const clean = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

export interface Suggestion {
  keywords: string[];
  /** Extra rules we detected structurally. */
  rules: RuleSpec[];
  /** Human-readable notes about what we saw, shown under the suggestion. */
  notes: string[];
  /** Raw recognized text, so the manager can sanity-check the read quality. */
  text: string;
}

export function suggestFromText(raw: string): Suggestion {
  const text = raw ?? "";
  const body = clean(text);
  const words = body.split(" ").filter(Boolean);
  const headerCut = Math.max(12, Math.floor(words.length * 0.15));

  const scores = new Map<string, number>();
  const bump = (term: string, weight: number) =>
    scores.set(term, (scores.get(term) ?? 0) + weight);

  words.forEach((w, i) => {
    if (w.length < 4 || GENERIC.has(w)) return;
    bump(w, i < headerCut ? 3 : 1);
  });

  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    if (GENERIC.has(a) && GENERIC.has(b)) continue;
    // Bigrams are far more identifying, so they get a x2.5 multiplier.
    bump(`${a} ${b}`, (i < headerCut ? 3 : 1) * 2.5);
  }

  const ranked = [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([term]) => term);

  // Prefer phrases; drop unigrams already covered by a chosen phrase.
  const picked: string[] = [];
  for (const term of ranked) {
    if (picked.length >= 8) break;
    if (picked.some((p) => p.includes(term) || term.includes(p))) continue;
    picked.push(term);
  }
  const keywords = picked.slice(0, 6);

  const rules: RuleSpec[] = [];
  const notes: string[] = [];

  if (/\$\s?\d/.test(text)) {
    rules.push({ kind: "hasFields", patterns: [{ label: "dollar amount", regex: "\\$\\s?\\d" }] });
    notes.push("Found a dollar amount, so we suggested a 'must show an amount' check.");
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
    notes.push("This sample contains something that looks like a Social Security number. Do not store sample images that contain real SSNs.");
  }
  if (/(exp(?:ires|iry|iration)|valid\s*(through|until)|good\s*through)/i.test(text)) {
    rules.push({ kind: "notExpired" });
    rules.push({ kind: "expiryReminder", withinDays: 45 });
    notes.push("Found expiry wording, so we suggested expiry checks.");
  } else if (/\b\d{1,2}[/-]\d{1,2}[/-](19|20)\d{2}\b/.test(text)) {
    rules.push({ kind: "recentWithin", days: 90 });
    notes.push("Found a date, so we suggested a 'dated within 90 days' check. Adjust the window to match your program.");
  }

  const readable = (text.match(/[a-z]{3,}/gi) ?? []).length;
  if (readable < 8) {
    notes.push("We could barely read this sample. Try a flat, evenly lit photo with the whole page in frame, or paste the document's text instead.");
  }

  return { keywords, rules, notes, text };
}
