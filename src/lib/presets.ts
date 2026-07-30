// Preset requirement templates for common programs.
// These are inspired by publicly documented HUD program norms.
// They are NOT legal advice — the property manager is expected to edit
// them for their specific program. PLACEHOLDERS.md tracks this decision.

import type { Requirement } from "./rules/engine";

export type PresetKey =
  | "section8" | "lihtc" | "public_housing" | "scratch"
  | "rad_pbv" | "senior_62" | "emergency_voucher" | "recert_annual";

const govPhotoId: Requirement = {
  id: "gov_id",
  name: "Government-issued photo ID",
  description:
    "A current driver's license, state ID, passport, or permanent resident card. Front side is enough for most programs.",
  perPerson: true,
  sampleHint: "Lay the card flat on a dark surface, fill the frame, and avoid flash glare on the hologram.",
  rules: [
    { kind: "docTypeKeywords", keywords: ["driver", "license", "identification", "state id", "passport", "resident"] },
    { kind: "nameMatch" },
    { kind: "notExpired" },
    { kind: "expiryReminder", withinDays: 45 },
  ],
};

const proofIncome: Requirement = {
  id: "proof_income",
  name: "Proof of income (recent)",
  description:
    "A pay stub, benefits letter, or offer letter from the last 60 days. Must show a dollar amount and the source (employer or agency).",
  perPerson: true,
  sampleHint: "Include the header with the employer name and the pay-period dates, not just the amount.",
  rules: [
    { kind: "hasFields", patterns: [{ label: "dollar amount", regex: "\\$\\s?\\d" }, { label: "employer or source", regex: "(employer|company|agency|inc|llc|corp|paid to|pay to)" }] },
    { kind: "recentWithin", days: 60 },
  ],
};

const proofAddress: Requirement = {
  id: "proof_address",
  name: "Proof of current address",
  description:
    "A utility bill, lease, or official letter dated within the last 90 days that shows your name and current address.",
  perPerson: false,
  rules: [
    { kind: "nameMatch" },
    { kind: "recentWithin", days: 90 },
    { kind: "docTypeKeywords", keywords: ["bill", "statement", "lease", "utility", "electric", "water", "gas", "internet"] },
  ],
};

const socialSecurity: Requirement = {
  id: "ssn_card",
  name: "Social Security card or ITIN letter",
  description:
    "A photo of your Social Security card, or an IRS ITIN assignment letter for each person on the application.",
  perPerson: true,
  rules: [
    { kind: "docTypeKeywords", keywords: ["social security", "administration", "itin", "individual taxpayer"] },
  ],
};

const birthCertificate: Requirement = {
  id: "birth_cert",
  name: "Birth certificate (each household member)",
  description: "An official birth certificate for every person who will live in the unit.",
  perPerson: true,
  rules: [
    { kind: "docTypeKeywords", keywords: ["birth", "certificate", "certification of birth", "registrar"] },
  ],
};

const referenceLetter: Requirement = {
  id: "reference_letter",
  name: "Landlord or personal reference letter",
  description: "A signed and dated letter from a previous landlord or a personal reference.",
  perPerson: false,
  rules: [
    { kind: "hasFields", patterns: [{ label: "signature line", regex: "(signed|signature|sincerely|regards|/s/)" }, { label: "a date", regex: "(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|(january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2})" }] },
  ],
};

const disabilityAward: Requirement = {
  id: "disability_award",
  name: "SSI / SSDI award letter",
  description: "The most recent award or benefit-verification letter showing the current monthly amount.",
  perPerson: true,
  rules: [
    { kind: "docTypeKeywords", keywords: ["social security", "supplemental security", "award", "benefit verification"] },
    { kind: "hasFields", patterns: [{ label: "monthly amount", regex: "\\$\\s?\\d" }] },
    { kind: "recentWithin", days: 365 },
  ],
};

const homelessCert: Requirement = {
  id: "homeless_cert",
  name: "Homelessness or at-risk certification",
  description: "A referral or certification letter from a shelter, outreach team, or continuum-of-care partner.",
  perPerson: false,
  rules: [
    { kind: "docTypeKeywords", keywords: ["shelter", "continuum", "outreach", "homeless", "referral", "coordinated entry"] },
    { kind: "recentWithin", days: 120 },
  ],
};

const taxReturn: Requirement = {
  id: "tax_return",
  name: "Most recent tax return or non-filer statement",
  description: "Page 1 of last year's 1040, or a signed statement that you were not required to file.",
  perPerson: true,
  rules: [
    { kind: "docTypeKeywords", keywords: ["1040", "internal revenue", "adjusted gross", "non-filer", "tax return"] },
  ],
};

const priorLease: Requirement = {
  id: "prior_lease",
  name: "Current lease or rent ledger",
  description: "The signed lease you are on today, or a rent ledger from your current landlord.",
  perPerson: false,
  rules: [
    { kind: "docTypeKeywords", keywords: ["lease", "tenancy", "rent", "landlord", "ledger"] },
    { kind: "nameMatch" },
  ],
};

export const PRESETS: Record<PresetKey, { label: string; requirements: Requirement[] }> = {
  section8: {
    label: "Section 8 (Housing Choice Voucher)",
    requirements: [govPhotoId, socialSecurity, proofIncome, proofAddress, birthCertificate, referenceLetter],
  },
  lihtc: {
    label: "LIHTC (tax-credit housing)",
    requirements: [govPhotoId, socialSecurity, proofIncome, proofAddress, referenceLetter],
  },
  public_housing: {
    label: "Public housing",
    requirements: [govPhotoId, socialSecurity, proofIncome, proofAddress, birthCertificate],
  },
  rad_pbv: {
    label: "RAD / project-based voucher conversion",
    requirements: [govPhotoId, socialSecurity, proofIncome, priorLease, proofAddress],
  },
  senior_62: {
    label: "Senior housing (62+)",
    requirements: [govPhotoId, socialSecurity, disabilityAward, proofIncome, proofAddress],
  },
  emergency_voucher: {
    label: "Emergency Housing Voucher / homeless set-aside",
    requirements: [govPhotoId, homelessCert, socialSecurity, proofIncome],
  },
  recert_annual: {
    label: "Annual recertification (existing tenants)",
    requirements: [proofIncome, taxReturn, priorLease],
  },
  scratch: { label: "Start from scratch", requirements: [] },
};

/**
 * Starter-template directory (suggested feature #9). Offices reinvent the
 * same programs with small variations, so every preset is presented as a
 * forkable template with a short description of who it fits.
 */
export interface TemplateCard {
  key: Exclude<PresetKey, "scratch">;
  label: string;
  blurb: string;
  count: number;
}

export const TEMPLATE_DIRECTORY: TemplateCard[] = (
  [
    ["section8", "The classic HCV intake list. Broadest coverage; trim what your PHA does not collect."],
    ["lihtc", "Tax-credit properties that verify income but do not need birth certificates."],
    ["public_housing", "Conventional public housing intake, including per-person birth records."],
    ["rad_pbv", "Converting residents onto project-based vouchers — leans on the existing lease."],
    ["senior_62", "Age-restricted properties where fixed-income award letters are the main proof."],
    ["emergency_voucher", "Rapid-placement set-asides: short list, referral-driven, no birth records."],
    ["recert_annual", "Yearly income recertification for households already housed."],
  ] as const
).map(([key, blurb]) => ({
  key,
  label: PRESETS[key].label,
  blurb,
  count: PRESETS[key].requirements.length,
}));

export const PRESET_DISCLAIMER =
  "These are examples inspired by common HUD program norms. They are not legal advice — please edit them for your program before sharing the link.";
