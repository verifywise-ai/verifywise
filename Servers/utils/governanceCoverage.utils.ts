import { sequelize } from "../database/db";
import {
  upsertCoverageCacheQuery,
  getCoverageCacheQuery,
  deleteCoverageCacheQuery,
} from "./governanceOs.utils";

interface FrameworkCoverage {
  framework_id: number;
  framework_name: string;
  total_controls: number;
  mapped_controls: number;
  coverage_percentage: number;
  gap_details: { unmapped_controls: string[] };
  synergy_details: { multi_framework_controls: string[] };
  calculation_methodology: string;
}

/**
 * Framework control inventory queries.
 *
 * Returns the total number of leaf-level controls / subcontrols / subclauses /
 * subcategories defined in each framework's master structure. This is the
 * honest denominator for coverage: it counts what the framework actually
 * requires, not how many mappings happen to exist.
 */
const FRAMEWORK_CONTROL_QUERIES: Record<number, string> = {
  1: `SELECT COUNT(*) as cnt FROM subcontrols_struct_eu sc
      JOIN controls_struct_eu c ON sc.control_id = c.id
      JOIN controlcategories_struct_eu cc ON c.control_category_id = cc.id
      WHERE cc.framework_id = 1`,
  2: `SELECT COUNT(*) as cnt FROM subclauses_struct_iso s
      JOIN clauses_struct_iso c ON s.clause_id = c.id
      WHERE c.framework_id = 2`,
  3: `SELECT COUNT(*) as cnt FROM subclauses_struct_iso27001 s
      JOIN clauses_struct_iso27001 c ON s.clause_id = c.id
      WHERE c.framework_id = 3`,
  4: `SELECT COUNT(*) as cnt FROM nist_ai_rmf_subcategories_struct s
      JOIN nist_ai_rmf_categories_struct c ON s.category_struct_id = c.id
      WHERE c.framework_id = 4`,
};

/**
 * Count the total number of controls defined in a framework's master inventory.
 *
 * Falls back to the number of distinct source identifiers currently mapped if
 * the framework is unknown, so the function never returns zero and avoids
 * division-by-zero. A zero or missing inventory is a data-quality signal that
 * should be logged and addressed separately.
 */
export const countFrameworkInventory = async (frameworkId: number): Promise<number> => {
  const query = FRAMEWORK_CONTROL_QUERIES[frameworkId];
  if (!query) {
    const [fallback] = await sequelize.query(
      `SELECT COUNT(DISTINCT source_control_identifier) as cnt
       FROM governance_control_mappings
       WHERE source_framework_id = :frameworkId`,
      { replacements: { frameworkId } },
    );
    return parseInt((fallback as any[])[0]?.cnt || "0", 10);
  }

  const [result] = await sequelize.query(query);
  return parseInt((result as any[])[0]?.cnt || "0", 10);
};

/**
 * Compute coverage analysis for a project.
 *
 * For each framework assigned to the project, computes:
 * - Total controls in that framework's master inventory
 * - How many of those inventory controls have cross-framework mappings
 * - Gap: inventory controls with no mappings to other active frameworks
 * - Synergy: controls mapped to 2+ other frameworks
 *
 * The denominator is the framework's full control inventory, not the count of
 * mapped controls. This prevents the metric from appearing artificially high.
 */
export const computeProjectCoverage = async (
  organizationId: number,
  projectId: number,
): Promise<FrameworkCoverage[]> => {
  // Get frameworks assigned to this project (validate org ownership)
  const [projectFrameworks] = await sequelize.query(
    `SELECT DISTINCT f.id as framework_id, f.name as framework_name
     FROM frameworks f
     JOIN projects_frameworks pf ON pf.framework_id = f.id
     JOIN projects p ON p.id = pf.project_id
     WHERE pf.project_id = :projectId AND p.organization_id = :organizationId`,
    { replacements: { projectId, organizationId } },
  );

  if (!projectFrameworks || (projectFrameworks as any[]).length === 0) {
    return [];
  }

  const frameworkIds = (projectFrameworks as any[]).map((f) => f.framework_id);

  // Compute each framework's coverage in parallel. The queries per framework
  // are independent, so this removes the sequential N+1 wait time while keeping
  // the SQL simple and easy to maintain.
  const coverages = await Promise.all(
    (projectFrameworks as any[]).map(async (fw) => {
      const otherIds = frameworkIds.filter((id: number) => id !== fw.framework_id);

      // Total controls from the framework's master inventory
      const totalControls = await countFrameworkInventory(fw.framework_id);

      // If no other frameworks in the project, mapped = 0
      let mappedControls = 0;
      let unmappedControls: string[] = [];
      let multiFrameworkControls: string[] = [];

      if (otherIds.length > 0) {
        // Mapped controls: distinct source identifiers that map to other frameworks
        // in the project. We intentionally count identifiers rather than leaf
        // inventory rows because mappings are stored at the article / clause /
        // function level, not the leaf control level.
        const [mappedResult] = await sequelize.query(
          `SELECT COUNT(DISTINCT source_control_identifier) as mapped
           FROM governance_control_mappings
           WHERE organization_id = :organizationId
             AND source_framework_id = :frameworkId
             AND target_framework_id IN (:otherIds)`,
          {
            replacements: {
              organizationId,
              frameworkId: fw.framework_id,
              otherIds,
            },
          },
        );
        mappedControls = parseInt((mappedResult as any[])[0]?.mapped || "0", 10);

        // Gap: source identifiers that exist in this org's mappings but have no
        // mapping to other active frameworks. This is a conservative gap list
        // based on the organization's own mapping corpus.
        const [gapResult] = await sequelize.query(
          `SELECT DISTINCT source_control_identifier
           FROM governance_control_mappings
           WHERE organization_id = :organizationId
             AND source_framework_id = :frameworkId
             AND source_control_identifier NOT IN (
               SELECT source_control_identifier FROM governance_control_mappings
               WHERE organization_id = :organizationId
                 AND source_framework_id = :frameworkId
                 AND target_framework_id IN (:otherIds)
             )`,
          {
            replacements: {
              organizationId,
              frameworkId: fw.framework_id,
              otherIds,
            },
          },
        );
        unmappedControls = (gapResult as any[]).map((r) => r.source_control_identifier);

        // Synergy: controls mapped to 2+ other frameworks
        const [synergyResult] = await sequelize.query(
          `SELECT source_control_identifier, COUNT(DISTINCT target_framework_id) as fw_count
           FROM governance_control_mappings
           WHERE organization_id = :organizationId
             AND source_framework_id = :frameworkId
             AND target_framework_id IN (:otherIds)
           GROUP BY source_control_identifier
           HAVING COUNT(DISTINCT target_framework_id) >= 2`,
          {
            replacements: {
              organizationId,
              frameworkId: fw.framework_id,
              otherIds,
            },
          },
        );
        multiFrameworkControls = (synergyResult as any[]).map((r) => r.source_control_identifier);
      }

      const coveragePercentage =
        totalControls > 0 ? Math.round((mappedControls / totalControls) * 10000) / 100 : 0;

      const coverage: FrameworkCoverage = {
        framework_id: fw.framework_id,
        framework_name: fw.framework_name,
        total_controls: totalControls,
        mapped_controls: mappedControls,
        coverage_percentage: coveragePercentage,
        gap_details: { unmapped_controls: unmappedControls },
        synergy_details: { multi_framework_controls: multiFrameworkControls },
        calculation_methodology:
          `Coverage = distinct mapped source identifiers (${mappedControls}) / ` +
          `framework inventory controls (${totalControls}). ` +
          `Inventory is counted from the framework's master structure tables (sub-controls, ` +
          `sub-clauses, or sub-categories). Gaps are source identifiers in this organization's ` +
          `mappings that are not mapped to any other active project framework.`,
      };

      return coverage;
    }),
  );

  // Cache all results in parallel. Each entry has a distinct framework_id so
  // there is no unique-key conflict between entries.
  await Promise.all(
    coverages.map((coverage) =>
      upsertCoverageCacheQuery({
        organization_id: organizationId,
        project_id: projectId,
        framework_id: coverage.framework_id,
        total_controls: coverage.total_controls,
        mapped_controls: coverage.mapped_controls,
        coverage_percentage: coverage.coverage_percentage,
        gap_details: coverage.gap_details,
        synergy_details: coverage.synergy_details,
        calculation_methodology: coverage.calculation_methodology,
      }),
    ),
  );

  return coverages;
};

/**
 * Get cached coverage or compute if stale/missing.
 */
export const getOrComputeCoverage = async (
  organizationId: number,
  projectId: number,
  forceRefresh = false,
): Promise<FrameworkCoverage[]> => {
  if (!forceRefresh) {
    const cached = await getCoverageCacheQuery(organizationId, projectId);
    if (cached.length > 0) {
      // Check if cache is less than 1 hour old
      const oldestEntry = cached.reduce((oldest, c) => {
        const computedAt = new Date((c as any).computed_at || 0).getTime();
        return computedAt < oldest ? computedAt : oldest;
      }, Date.now());

      const ONE_HOUR = 60 * 60 * 1000;
      if (Date.now() - oldestEntry < ONE_HOUR) {
        return cached.map((c) => ({
          framework_id: c.framework_id,
          framework_name: (c as any).framework_name || "",
          total_controls: c.total_controls,
          mapped_controls: c.mapped_controls,
          coverage_percentage: Number(c.coverage_percentage),
          gap_details: (c.gap_details as any) || { unmapped_controls: [] },
          synergy_details: (c.synergy_details as any) || { multi_framework_controls: [] },
          calculation_methodology:
            (c as any).calculation_methodology ||
            "Coverage = mapped controls / total framework inventory controls.",
        }));
      }
    }
  }

  return computeProjectCoverage(organizationId, projectId);
};

/**
 * Invalidate coverage cache for a project or organization.
 *
 * Called after mapping mutations and project framework changes to ensure
 * coverage numbers do not stay stale.
 */
export const invalidateCoverageCache = async (
  organizationId: number,
  projectId?: number,
): Promise<void> => {
  await deleteCoverageCacheQuery(organizationId, projectId);
};
