// RealDoor deterministic rule engine.
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

export interface Requirement {
  id: string;
  name: string;
  description: string;
  /** If true, one doc per applicant + co-applicant */
  perPerson: boolean;
  rules: RuleSpec[];
}

export type RuleSeverity = "pass" | "fail" | "info";

export interface RuleIssue {
  rule: RuleKind;
  message: string;
  severity: RuleSeverity;
}

export interface RuleResult {
  status: "pass" | "needs_fixing" | "flagged";
  issues: RuleIssue[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Extract the earliest recognizable date from text. Returns Date or null. */
export function extractFirstDate(text: string): Date | null {
  // MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
  const mdY = text.match(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-]((?:19|20)\d{2})\b/);
  if (mdY) return new Date(+mdY[3], +mdY[1] - 1, +mdY[2]);
  const ymd = text.match(/\b((?:19|20)\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
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

  for (const rule of spec) {
    switch (rule.kind) {
      case "nameMatch": {
        const t = norm(text);
        const hit = ctx.names.some((n) => {
          const parts = norm(n).split(" ").filter((p) => p.length >= 3);
          // Match if at least the first name AND last name appear
          if (parts.length < 2) return parts[0] ? t.includes(parts[0]) : false;
          return t.includes(parts[0]) && t.includes(parts[parts.length - 1]);
        });
        if (!hit) issues.push({ rule: "nameMatch", severity: "fail",
          message: "We couldn't find the applicant's name on this document. Make sure the name is visible in the photo." });
        break;
      }
      case "notExpired": {
        const exp = extractExpiryDate(text) ?? extractFirstDate(text);
        if (exp && exp.getTime() < now.getTime()) {
          issues.push({ rule: "notExpired", severity: "fail",
            message: `This document appears to have expired on ${exp.toLocaleDateString()}.` });
        }
        break;
      }
      case "recentWithin": {
        const d = extractFirstDate(text);
        if (!d) {
          issues.push({ rule: "recentWithin", severity: "fail",
            message: `We couldn't find a date on this document. It needs to be dated within the last ${rule.days} days.` });
        } else {
          const ageDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
          if (ageDays > rule.days) {
            issues.push({ rule: "recentWithin", severity: "fail",
              message: `This document is ${ageDays} days old — the program requires something dated within the last ${rule.days} days.` });
          }
        }
        break;
      }
      case "hasFields": {
        for (const p of rule.patterns) {
          const re = new RegExp(p.regex, "i");
          if (!re.test(text)) {
            issues.push({ rule: "hasFields", severity: "fail",
              message: `We couldn't find a ${p.label} on this document.` });
          }
        }
        break;
      }
      case "docTypeKeywords": {
        const t = norm(text);
        const hit = rule.keywords.some((k) => t.includes(norm(k)));
        if (!hit) issues.push({ rule: "docTypeKeywords", severity: "fail",
          message: "This photo doesn't look like the kind of document we're expecting here. Double-check that you uploaded the right one." });
        break;
      }
      case "expiryReminder": {
        const exp = extractExpiryDate(text);
        if (exp) {
          const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
          if (daysLeft >= 0 && daysLeft <= rule.withinDays) {
            issues.push({ rule: "expiryReminder", severity: "info",
              message: `Heads up — this document expires on ${exp.toLocaleDateString()}, which is within ${rule.withinDays} days.` });
          }
        }
        break;
      }
    }
  }

  const hasFail = issues.some((i) => i.severity === "fail");
  return {
    status: hasFail ? "needs_fixing" : "pass",
    issues,
  };
}
