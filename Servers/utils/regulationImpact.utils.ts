export type EntityType = "system" | "control" | "policy" | "vendor" | "assessment";

export interface Candidate {
  type: EntityType;
  id: number;
  name: string;
  description: string;
}

export interface LlmVerdict {
  type: EntityType;
  id: number;
  affected: boolean;
  why: string;
}

// geography enum: 1 Global, 2 Europe, 3 North America, 4 South America, 5 Asia, 6 Africa
const REGION_BY_COUNTRY: Record<string, number> = {
  "european union": 2, germany: 2, france: 2, italy: 2, spain: 2,
  netherlands: 2, "united kingdom": 2, ireland: 2, poland: 2, sweden: 2,
  "united states": 3, canada: 3, mexico: 3,
  brazil: 4, argentina: 4, chile: 4,
  china: 5, japan: 5, "south korea": 5, india: 5, singapore: 5,
  "south africa": 6, nigeria: 6, kenya: 6, egypt: 6,
};

export function regionForCountry(countryName: string): number | null {
  if (!countryName) return null;
  const key = countryName.trim().toLowerCase();
  return REGION_BY_COUNTRY[key] ?? null;
}

const FRAMEWORK_BY_TYPE: Record<string, string[]> = {
  "eu ai act": ["EU AI Act"],
  "iso 42001": ["ISO 42001"],
  "iso/iec 42001": ["ISO 42001"],
  "iso 27001": ["ISO 27001"],
  "iso/iec 27001": ["ISO 27001"],
  "nist ai rmf": ["NIST AI RMF"],
};

export function frameworksForRegulation(reg: { type?: string; country?: string }): string[] {
  const t = (reg.type ?? "").trim().toLowerCase();
  if (FRAMEWORK_BY_TYPE[t]) return FRAMEWORK_BY_TYPE[t];
  // EU-bloc regulations imply the EU AI Act framework even when type is free-text.
  if ((reg.country ?? "").trim().toLowerCase() === "european union") return ["EU AI Act"];
  return [];
}

export function validateVerdicts(raw: unknown, sent: Candidate[]): LlmVerdict[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const sentKeys = new Set(sent.map((c) => `${c.type}:${c.id}`));
  const out: LlmVerdict[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const { type, id, affected, why } = r as Record<string, unknown>;
    if (typeof type !== "string" || typeof id !== "number") continue;
    if (!sentKeys.has(`${type}:${id}`)) continue;
    if (typeof affected !== "boolean") continue;
    if (typeof why !== "string" || why.trim() === "") continue;
    out.push({ type: type as EntityType, id, affected, why: why.trim() });
  }
  return out;
}
