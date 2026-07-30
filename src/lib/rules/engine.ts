// DocKit deterministic rule engine.
//
// Every check runs on OCR text (a string) and returns a Result. No cloud
// calls, no LLM, no fuzzy inference. The rules are intentionally lenient —
// we prefer false negatives (letting a manager see the doc) over false
// positives (auto-rejecting the renter). The property manager is always
// the final judge.

export type RuleKind =
  | "nameMatch"
  | "notExpired"
  | "recentWithin"
  | "hasFields"
  | "docTypeKeywords"
  | "expiryReminder";

export type RuleSpec =
  | { kind: "nameMatch" }
  | { kind: "notExpired" }
  | { kind: "recentWithin"; days: number }
  | { kind: "hasFields"; patterns: { label: string; regex: string }[] }
  | { kind: "docTypeKeywords"; keywords: string[] }
  | { kind: "expiryReminder"; withinDays: number };

export const RULE_LABELS: Record<RuleKind, string> = {
  nameMatch: "Applicant's name appears on the document",
  notExpired: "Document is not expired",
  recentWithin: "Document is dated recently",
  hasFields: "Required fields are present",
  docTypeKeywords: "Document looks like the right type",
  expiryReminder: "Warn if it expires soon",
};

export interface Requirement {
  id: string;
  name: string;
  description: string;
  /** If true, one doc per applicant + co-applicant */
  perPerson: boolean;
  rules: RuleSpec[];
  /** Optional example photo shown to renters (small inline JPEG data URL). */
  sampleImage?: string;
  /** Short "what a good photo looks like" tip shown next to the sample. */
  sampleHint?: string;
}

export type RuleSeverity = "pass" | "fail" | "info";

export interface RuleIssue {
  rule: RuleKind;
  message: string;
  severity: RuleSeverity;
}

/** Per-rule detail for the manager-facing explainability panel (feature #12). */
export interface RuleTrace {
  rule: RuleKind;
  label: string;
  passed: boolean;
  /** What the rule actually looked for — regex, keyword list, day window. */
  looksFor: string;
  /** What it found, if anything. */
  found: string;
}

export interface RuleResult {
  status: "pass" | "needs_fixing" | "flagged";
  issues: RuleIssue[];
  trace: RuleTrace[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Extract the earliest recognizable date from text. Returns Date or null. */
export function extractFirstDate(text: string): Date | null {
  const mdY = text.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-]((?:19|20)\d{2})\b/);
  if (mdY) return new Date(+mdY[3], +mdY[1] - 1, +mdY[2]);
  const ymd = text.match(/\b((?:19|20)\d{2})[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const monthName = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/i,
  );
  if (monthName) {
    const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const m = months.indexOf(monthName[1].toLowerCase());
    return new Date(+monthName[3], m, +monthName[2]);
  }
  return null;
}

/** Every date we can find, for the explainability panel. */
export function extractAllDates(text: string): Date[] {
  const out: Date[] = [];
  const re = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-]((?:19|20)\d{2})\b|\b((?:19|20)\d{2})[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = extractFirstDate(m[0]);
    if (d && !Number.isNaN(d.getTime())) out.push(d);
    if (out.length > 20) break;
  }
  return out;
}

/** Find an explicit expiration date via keyword proximity. */
export function extractExpiryDate(text: string): Date | null {
  const t = text.toLowerCase();
  const idx = t.search(/(exp(?:ires|iry|iration)?|expires\s*on|good\s*through|valid\s*through|valid\s*until)/);
  if (idx < 0) return null;
  const window = text.slice(idx, idx + 80);
  return extractFirstDate(window);
}

interface RunCtx {
  names: string[];
  today?: Date;
}

export function runRules(spec: RuleSpec[], ocrText: string, ctx: RunCtx): RuleResult {
  const text = ocrText ?? "";
  const now = ctx.today ?? new Date();
  const issues: RuleIssue[] = [];
  const trace: RuleTrace[] = [];

  const push = (rule: RuleKind, passed: boolean, looksFor: string, found: string) =>
    trace.push({ rule, label: RULE_LABELS[rule], passed, looksFor, found });

  for (const rule of spec) {
    switch (rule.kind) {
      case "nameMatch": {
        const t = norm(text);
        const hit = ctx.names.some((n) => {
          const parts = norm(n).split(" ").filter((p) => p.length >= 3);
          if (parts.length < 2) return parts[0] ? t.includes(parts[0]) : false;
          return t.includes(parts[0]) && t.includes(parts[parts.length - 1]);
        });
        push("nameMatch", hit, `first + last name of: ${ctx.names.join(", ") || "(no name entered)"}`,
          hit ? "name found in the recognized text" : "no match in the recognized text");
        if (!hit) issues.push({ rule: "nameMatch", severity: "fail",
          message: "We couldn't find the applicant's name on this document. Make sure the name is visible in the photo." });
        break;
      }
      case "notExpired": {
        const exp = extractExpiryDate(text) ?? extractFirstDate(text);
        const expired = !!exp && exp.getTime() < now.getTime();
        push("notExpired", !expired, "an expiry date at or after today",
          exp ? exp.toLocaleDateString() : "no date found");
        if (expired && exp) {
          issues.push({ rule: "notExpired", severity: "fail",
            message: `This document appears to have expired on ${exp.toLocaleDateString()}.` });
        }
        break;
      }
      case "recentWithin": {
        const d = extractFirstDate(text);
        if (!d) {
          push("recentWithin", false, `a date within the last ${rule.days} days`, "no date found");
          issues.push({ rule: "recentWithin", severity: "fail",
            message: `We couldn't find a date on this document. It needs to be dated within the last ${rule.days} days.` });
        } else {
          const ageDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
          const ok = ageDays <= rule.days;
          push("recentWithin", ok, `a date within the last ${rule.days} days`,
            `${d.toLocaleDateString()} (${ageDays} days old)`);
          if (!ok) {
            issues.push({ rule: "recentWithin", severity: "fail",
              message: `This document is ${ageDays} days old, and the program requires something dated within the last ${rule.days} days.` });
          }
        }
        break;
      }
      case "hasFields": {
        for (const p of rule.patterns) {
          const re = new RegExp(p.regex, "i");
          const m = re.exec(text);
          push("hasFields", !!m, `${p.label} — /${p.regex}/i`, m ? `matched "${m[0].slice(0, 40)}"` : "no match");
          if (!m) {
            issues.push({ rule: "hasFields", severity: "fail",
              message: `We couldn't find a ${p.label} on this document.` });
          }
        }
        break;
      }
      case "docTypeKeywords": {
        const t = norm(text);
        const matched = rule.keywords.filter((k) => t.includes(norm(k)));
        push("docTypeKeywords", matched.length > 0, `any of: ${rule.keywords.join(", ")}`,
          matched.length ? `matched: ${matched.join(", ")}` : "none of the keywords appeared");
        if (matched.length === 0) issues.push({ rule: "docTypeKeywords", severity: "fail",
          message: "This photo doesn't look like the kind of document we're expecting here. Double-check that you uploaded the right one." });
        break;
      }
      case "expiryReminder": {
        const exp = extractExpiryDate(text);
        push("expiryReminder", true, `expiry within ${rule.withinDays} days`,
          exp ? exp.toLocaleDateString() : "no expiry date found");
        if (exp) {
          const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
          if (daysLeft >= 0 && daysLeft <= rule.withinDays) {
            issues.push({ rule: "expiryReminder", severity: "info",
              message: `Heads up, this document expires on ${exp.toLocaleDateString()}, which is within ${rule.withinDays} days.` });
          }
        }
        break;
      }
    }
  }

  const hasFail = issues.some((i) => i.severity === "fail");
  return { status: hasFail ? "needs_fixing" : "pass", issues, trace };
}
