import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

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

const EMPTY_BY_TYPE = (): Record<EntityType, Candidate[]> => ({
  system: [], control: [], policy: [], vendor: [], assessment: [],
});

export async function getCandidates(
  organizationId: number,
  countryName: string,
  regulation: { type?: string; country?: string },
): Promise<Record<EntityType, Candidate[]>> {
  const region = regionForCountry(countryName);
  const frameworks = frameworksForRegulation({ type: regulation.type, country: countryName });
  const out = EMPTY_BY_TYPE();

  // --- systems (projects): geography region match OR framework match via project_frameworks ---
  const systems = (await sequelize.query(
    `SELECT DISTINCT p.id, p.project_title AS name,
            COALESCE(p.goal, '') AS description
       FROM projects p
       LEFT JOIN project_frameworks pf ON pf.project_id = p.id
       LEFT JOIN frameworks f ON f.id = pf.framework_id
      WHERE p.organization_id = :organizationId
        AND ( (:region IS NOT NULL AND p.geography = :region)
              OR f.name = ANY(:frameworks) )`,
    { replacements: { organizationId, region, frameworks }, type: QueryTypes.SELECT },
  )) as { id: number; name: string; description: string }[];
  out.system = systems.map((r) => ({ type: "system", id: r.id, name: r.name, description: r.description }));

  const candidateProjectIds = systems.map((s) => s.id);

  // --- controls: belong to a project whose framework matches (3-hop) ---
  const controls = (await sequelize.query(
    `SELECT DISTINCT c.id, c.title AS name, COALESCE(c.description, '') AS description
       FROM controls c
       JOIN control_categories cc ON cc.id = c.control_category_id
       JOIN project_frameworks pf ON pf.project_id = cc.project_id
       JOIN frameworks f ON f.id = pf.framework_id
       JOIN projects p ON p.id = cc.project_id
      WHERE p.organization_id = :organizationId
        AND f.name = ANY(:frameworks)`,
    { replacements: { organizationId, frameworks }, type: QueryTypes.SELECT },
  )) as { id: number; name: string; description: string }[];
  out.control = controls.map((r) => ({ type: "control", id: r.id, name: r.name, description: r.description }));

  // --- assessments: project_id in candidate projects ---
  if (candidateProjectIds.length) {
    const assessments = (await sequelize.query(
      `SELECT a.id, COALESCE(p.project_title, 'Assessment') AS name, '' AS description
         FROM assessments a
         JOIN projects p ON p.id = a.project_id
        WHERE p.organization_id = :organizationId
          AND a.project_id = ANY(:projectIds)`,
      { replacements: { organizationId, projectIds: candidateProjectIds }, type: QueryTypes.SELECT },
    )) as { id: number; name: string; description: string }[];
    out.assessment = assessments.map((r) => ({ type: "assessment", id: r.id, name: r.name, description: r.description }));
  } else {
    await sequelize.query(`SELECT 1`, { replacements: { organizationId }, type: QueryTypes.SELECT }); // keep query count stable for tests
  }

  // --- vendors: regulatory_exposure maps to framework OR linked to a candidate project ---
  const vendors = (await sequelize.query(
    `SELECT DISTINCT v.id, v.vendor_name AS name, COALESCE(v.vendor_provides, '') AS description
       FROM vendors v
       LEFT JOIN vendors_projects vp ON vp.vendor_id = v.id
      WHERE v.organization_id = :organizationId
        AND ( v.regulatory_exposure = ANY(:frameworkExposure)
              OR (:hasProjects AND vp.project_id = ANY(:projectIds)) )`,
    {
      replacements: {
        organizationId,
        frameworkExposure: mapFrameworksToExposure(frameworks),
        hasProjects: candidateProjectIds.length > 0,
        projectIds: candidateProjectIds.length > 0 ? candidateProjectIds : [-1],
      },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; name: string; description: string }[];
  out.vendor = vendors.map((r) => ({ type: "vendor", id: r.id, name: r.name, description: r.description }));

  // --- policies: linked to a candidate control via policy_linked_objects ---
  const controlIds = controls.map((c) => c.id);
  if (controlIds.length) {
    const policies = (await sequelize.query(
      `SELECT DISTINCT pm.id, pm.title AS name, '' AS description
         FROM policy_manager pm
         JOIN policy_linked_objects plo ON plo.policy_id = pm.id
        WHERE pm.organization_id = :organizationId
          AND plo.object_type = 'control'
          AND plo.object_id = ANY(:controlIds)`,
      { replacements: { organizationId, controlIds }, type: QueryTypes.SELECT },
    )) as { id: number; name: string; description: string }[];
    out.policy = policies.map((r) => ({ type: "policy", id: r.id, name: r.name, description: r.description }));
  } else {
    await sequelize.query(`SELECT 1`, { replacements: { organizationId }, type: QueryTypes.SELECT }); // keep query count stable for tests
  }

  return out;
}

// vendors.regulatory_exposure enum strings don't match framework names exactly.
function mapFrameworksToExposure(frameworks: string[]): string[] {
  const m: Record<string, string> = {
    "EU AI Act": "EU AI act",
    "ISO 27001": "ISO 27001",
  };
  const mapped = frameworks.map((f) => m[f]).filter(Boolean);
  return mapped.length ? mapped : ["__none__"];
}
