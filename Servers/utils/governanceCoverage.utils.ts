import { sequelize } from "../database/db";
import { upsertCoverageCacheQuery, getCoverageCacheQuery } from "./governanceOs.utils";

interface FrameworkCoverage {
  framework_id: number;
  framework_name: string;
  total_controls: number;
  mapped_controls: number;
  coverage_percentage: number;
  gap_details: { unmapped_controls: string[] };
  synergy_details: { multi_framework_controls: string[] };
}

/**
 * Compute coverage analysis for a project.
 *
 * For each framework assigned to the project, computes:
 * - Total controls in that framework
 * - How many of those controls have cross-framework mappings
 * - Gap: controls with no mappings to other active frameworks
 * - Synergy: controls mapped by 3+ frameworks
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
  const results: FrameworkCoverage[] = [];

  for (const fw of projectFrameworks as any[]) {
    const otherIds = frameworkIds.filter((id: number) => id !== fw.framework_id);

    // Count total controls for this framework (using source side of mappings as proxy)
    const [controlCountResult] = await sequelize.query(
      `SELECT COUNT(DISTINCT source_control_identifier) as total
       FROM governance_control_mappings
       WHERE source_framework_id = :frameworkId`,
      { replacements: { frameworkId: fw.framework_id } },
    );
    const totalFromSource = parseInt((controlCountResult as any[])[0]?.total || "0", 10);

    // Also count from target side
    const [targetCountResult] = await sequelize.query(
      `SELECT COUNT(DISTINCT target_control_identifier) as total
       FROM governance_control_mappings
       WHERE target_framework_id = :frameworkId`,
      { replacements: { frameworkId: fw.framework_id } },
    );
    const totalFromTarget = parseInt((targetCountResult as any[])[0]?.total || "0", 10);

    // Total unique controls that appear in any mapping
    const totalControls = Math.max(totalFromSource, totalFromTarget, 1);

    // If no other frameworks in the project, mapped = 0
    let mappedControls = 0;
    let unmappedControls: string[] = [];
    let multiFrameworkControls: string[] = [];

    if (otherIds.length > 0) {
      // Mapped controls: those that map to other frameworks in the project
      const [mappedResult] = await sequelize.query(
        `SELECT COUNT(DISTINCT source_control_identifier) as mapped
         FROM governance_control_mappings
         WHERE source_framework_id = :frameworkId
           AND target_framework_id IN (:otherIds)`,
        {
          replacements: {
            frameworkId: fw.framework_id,
            otherIds,
          },
        },
      );
      mappedControls = parseInt((mappedResult as any[])[0]?.mapped || "0", 10);

      // Gap: controls that exist but have no mapping to other active frameworks
      const [gapResult] = await sequelize.query(
        `SELECT DISTINCT source_control_identifier
         FROM governance_control_mappings
         WHERE source_framework_id = :frameworkId
           AND source_control_identifier NOT IN (
             SELECT source_control_identifier FROM governance_control_mappings
             WHERE source_framework_id = :frameworkId
               AND target_framework_id IN (:otherIds)
           )`,
        {
          replacements: {
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
         WHERE source_framework_id = :frameworkId
           AND target_framework_id IN (:otherIds)
         GROUP BY source_control_identifier
         HAVING COUNT(DISTINCT target_framework_id) >= 2`,
        {
          replacements: {
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
    };

    results.push(coverage);

    // Cache the result
    await upsertCoverageCacheQuery({
      organization_id: organizationId,
      project_id: projectId,
      framework_id: fw.framework_id,
      total_controls: totalControls,
      mapped_controls: mappedControls,
      coverage_percentage: coveragePercentage,
      gap_details: coverage.gap_details,
      synergy_details: coverage.synergy_details,
    });
  }

  return results;
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
          framework_name: "",
          total_controls: c.total_controls,
          mapped_controls: c.mapped_controls,
          coverage_percentage: Number(c.coverage_percentage),
          gap_details: (c.gap_details as any) || { unmapped_controls: [] },
          synergy_details: (c.synergy_details as any) || { multi_framework_controls: [] },
        }));
      }
    }
  }

  return computeProjectCoverage(organizationId, projectId);
};
