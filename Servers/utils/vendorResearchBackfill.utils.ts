/**
 * The queries of the backfill of the credibility label (spec D4.6, Rulings 2, 3 and 7 of the M3
 * plan). Only its maintainer script runs them (scripts/vendorResearchBackfillCredibility.ts), never
 * startup or a migration. The script walks the organizations one at a time: every statement here
 * but the list of the organizations filters on `organization_id`, and the backfill never writes a
 * finding of an organization it was not asked about.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type {
  BackfilledCredibilityBasis,
  CredibilityLabel,
  EvidenceSource,
  FindingConfidence,
  FindingSource,
  FindingStatus,
  LegacyCredibilityBasis,
  ResearchCategory,
} from "../domain.layer/interfaces/i.vendorResearch";
import type { LegacyFinding } from "../services/vendorResearch/backfill";
import type { buildTarget } from "../services/vendorResearch/target";
import type { TraceStep } from "../services/vendorResearch/trace";

/** A finding without a label, with the vendor and the run it came from. */
export type FindingToBackfill = LegacyFinding & { vendor_id: number; run_id: number };

/** What the backfill reads of a run: the pack its analysis read, and its trace. */
export interface RunForBackfill {
  evidence: EvidenceSource[] | null;
  trace: { steps?: TraceStep[] } | null;
}

/** The ids of the organizations, in order: the script walks them one at a time. */
export const listOrganizationIdsQuery = async (): Promise<number[]> => {
  const rows = (await sequelize.query(`SELECT id FROM organizations ORDER BY id`, {
    type: QueryTypes.SELECT,
  })) as Array<{ id: number | string }>;
  return rows.map((row) => Number(row.id));
};

/**
 * The findings of the organization without a label, whatever their status, in id order after
 * `afterId`, at most `limit` of them: the script reads a batch, writes it, and reads the next
 * after the last id.
 */
export const findFindingsToBackfillQuery = async (
  organizationId: number,
  afterId: number,
  limit: number,
): Promise<FindingToBackfill[]> => {
  const rows = (await sequelize.query(
    `SELECT id, vendor_id, run_id, status, category, sources, snippet_only, confidence, created_at
     FROM vendor_risk_findings
     WHERE organization_id = :organizationId AND credibility IS NULL AND id > :afterId
     ORDER BY id
     LIMIT :limit`,
    { replacements: { organizationId, afterId, limit }, type: QueryTypes.SELECT },
  )) as Array<{
    id: number | string;
    vendor_id: number | string;
    run_id: number | string;
    status: FindingStatus;
    category: ResearchCategory;
    sources: FindingSource[] | null;
    snippet_only: boolean | null;
    confidence: FindingConfidence | null;
    created_at: Date | string;
  }>;
  return rows.map((row) => ({
    id: Number(row.id),
    vendor_id: Number(row.vendor_id),
    run_id: Number(row.run_id),
    status: row.status,
    category: row.category,
    sources: Array.isArray(row.sources) ? row.sources : [],
    snippet_only: row.snippet_only === true,
    confidence: row.confidence,
    created_at: new Date(row.created_at).toISOString(),
  }));
};

/** The stored pack and trace of a run of the organization; null when it has no such run. */
export const getRunForBackfillQuery = async (
  organizationId: number,
  runId: number,
): Promise<RunForBackfill | null> => {
  const rows = (await sequelize.query(
    `SELECT evidence, trace FROM vendor_research_runs
     WHERE organization_id = :organizationId AND id = :runId`,
    { replacements: { organizationId, runId }, type: QueryTypes.SELECT },
  )) as RunForBackfill[];
  return rows[0] ?? null;
};

/** The vendor of the organization as it is now, as `buildTarget` reads it; null when none. */
export const getVendorForBackfillQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<Parameters<typeof buildTarget>[0] | null> => {
  const rows = (await sequelize.query(
    `SELECT vendor_name, website, vendor_provides, other_names, country, registration_number, lei,
            sec_cik
     FROM vendors
     WHERE organization_id = :organizationId AND id = :vendorId`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  )) as Array<Parameters<typeof buildTarget>[0]>;
  return rows[0] ?? null;
};

/**
 * Writes the label the backfill gave a finding of the organization, only while the finding still
 * has the status it was read with and no label (Ruling 7): one a person decided, or a live run
 * labelled, since the read is left as it is. True when it wrote.
 */
export const writeBackfillQuery = async (input: {
  organizationId: number;
  id: number;
  status: FindingStatus;
  credibility: CredibilityLabel;
  basis: BackfilledCredibilityBasis | LegacyCredibilityBasis;
}): Promise<boolean> => {
  const rows = (await sequelize.query(
    `UPDATE vendor_risk_findings
     SET credibility = :credibility, credibility_basis = CAST(:basis AS jsonb)
     WHERE organization_id = :organizationId AND id = :id AND status = :status
       AND credibility IS NULL
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        id: input.id,
        status: input.status,
        credibility: input.credibility,
        basis: JSON.stringify(input.basis),
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return rows.length > 0;
};

/**
 * Clears what the backfill wrote in the organization (Ruling 2): the labels whose rule is
 * `legacy_confidence` or starts with `backfill_`, never a label a run wrote. A `backfill_` label of
 * a finding a person accepted or dismissed since is kept: it is what they decided the finding by
 * (spec D4.6), and a later backfill would give it its old confidence instead. How many labels it
 * cleared, and how many it kept.
 */
export const undoBackfillQuery = async (
  organizationId: number,
): Promise<{ cleared: number; kept: number }> => {
  const rows = (await sequelize.query(
    `WITH cleared AS (
       UPDATE vendor_risk_findings
       SET credibility = NULL, credibility_basis = NULL
       WHERE organization_id = :organizationId
         AND (credibility_basis->>'rule' = 'legacy_confidence'
              OR (status = 'pending' AND starts_with(credibility_basis->>'rule', 'backfill_')))
       RETURNING id
     )
     SELECT (SELECT count(*) FROM cleared) AS cleared,
            (SELECT count(*) FROM vendor_risk_findings
             WHERE organization_id = :organizationId AND status <> 'pending'
               AND starts_with(credibility_basis->>'rule', 'backfill_')) AS kept`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ cleared: number | string; kept: number | string }>;
  return { cleared: Number(rows[0].cleared), kept: Number(rows[0].kept) };
};
