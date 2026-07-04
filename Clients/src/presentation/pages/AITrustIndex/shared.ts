// Clients/src/presentation/pages/AITrustIndex/shared.ts
import type { ChipVariant } from "../../types/interfaces/i.chip";
import type { IndicatorMap } from "./rubric";

export interface TrustIndexAppData {
  slug: string;
  name: string;
  vendor: string;
  domain: string;
  category: string;
  scoreOutOf100: number;
  letterGrade: string;
  displayedGrade: string;
  confidence: string;
  dealbreakerFlags: string[];
  summary: string;
  highlights: { label: string; text: string }[];
  policyUrl: string;
  policyLastUpdated: string | null;
  modalities: string[];
  processesBiometrics: boolean;
  indicators?: IndicatorMap | null;
}

export interface TrustIndexRow {
  slug: string;
  app_slug?: string;
  name: string;
  vendor?: string;
  category?: string;
  letter_grade?: string;
  score_out_of_100?: number;
  data: TrustIndexAppData;
  is_tracked?: boolean;
  is_active?: boolean;
  no_longer_in_index?: boolean;
}

/**
 * Map a letter grade to a shared Chip variant so grades render as real
 * VerifyWise chips. The variants preserve the green→red risk semantic:
 * A=success (green), B=info (blue), C=warning (amber), D=high (orange),
 * F=critical (red).
 */
export const GRADE_VARIANT: Record<string, ChipVariant> = {
  A: "success",
  B: "info",
  C: "warning",
  D: "high",
  F: "critical",
};

/** Resolve a (possibly multi-char) grade to its Chip variant via its first letter. */
export function gradeVariant(grade?: string): ChipVariant {
  if (!grade) return "default";
  return GRADE_VARIANT[grade.charAt(0).toUpperCase()] ?? "default";
}

/**
 * Map a feed category to one of the shared Chip component's variants, so each
 * category renders as a real VerifyWise chip (consistent gradient/border/palette)
 * rather than an ad-hoc custom color. Distinct, non-alarming variants are chosen
 * so categories are visually separable without implying risk semantics.
 */
export const CATEGORY_VARIANT: Record<string, ChipVariant> = {
  "Assistant": "info", // blue
  "Image & video": "moderate", // muted yellow/amber
  "Audio": "success", // green
  "Companion": "warning", // amber
  "Productivity": "default", // grey
};

/** Resolve a category to its Chip variant, falling back to "default" for unknowns. */
export function categoryVariant(category?: string): ChipVariant {
  if (!category) return "default";
  return CATEGORY_VARIANT[category] ?? "default";
}

export function faviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}
