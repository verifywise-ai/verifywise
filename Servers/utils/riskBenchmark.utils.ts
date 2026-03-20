import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { IRiskBenchmark } from "../domain.layer/interfaces/I.quantitativeRisk";

/**
 * Get all risk benchmarks, optionally filtered by industry and/or AI risk type.
 */
export async function getAllBenchmarksQuery(
  industry?: string,
  aiRiskType?: string
): Promise<IRiskBenchmark[]> {
  let whereClause = "";
  const replacements: Record<string, string> = {};

  const conditions: string[] = [];
  if (industry) {
    conditions.push("industry = :industry");
    replacements.industry = industry;
  }
  if (aiRiskType) {
    conditions.push("ai_risk_type = :aiRiskType");
    replacements.aiRiskType = aiRiskType;
  }
  if (conditions.length > 0) {
    whereClause = `WHERE ${conditions.join(" AND ")}`;
  }

  return await sequelize.query<IRiskBenchmark>(
    `SELECT * FROM risk_benchmarks ${whereClause} ORDER BY industry, ai_risk_type, category`,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );
}

/**
 * Get a single risk benchmark by ID.
 */
export async function getBenchmarkByIdQuery(
  id: number
): Promise<IRiskBenchmark | null> {
  const results = await sequelize.query<IRiskBenchmark>(
    `SELECT * FROM risk_benchmarks WHERE id = :id`,
    {
      replacements: { id },
      type: QueryTypes.SELECT,
    }
  );
  return results[0] || null;
}

/**
 * Get distinct industries from benchmarks (for filter dropdowns).
 */
export async function getBenchmarkIndustriesQuery(): Promise<string[]> {
  const results = await sequelize.query<{ industry: string }>(
    `SELECT DISTINCT industry FROM risk_benchmarks ORDER BY industry`,
    { type: QueryTypes.SELECT }
  );
  return results.map((r) => r.industry);
}

/**
 * Get distinct AI risk types from benchmarks (for filter dropdowns).
 */
export async function getBenchmarkAiRiskTypesQuery(): Promise<string[]> {
  const results = await sequelize.query<{ ai_risk_type: string }>(
    `SELECT DISTINCT ai_risk_type FROM risk_benchmarks ORDER BY ai_risk_type`,
    { type: QueryTypes.SELECT }
  );
  return results.map((r) => r.ai_risk_type);
}

/**
 * Apply a benchmark's values to a risk record.
 * Copies the benchmark's frequency and loss magnitude values to the risk.
 */
export async function applyBenchmarkToRiskQuery(
  riskId: number,
  benchmarkId: number,
  organizationId: number
): Promise<boolean> {
  const benchmark = await getBenchmarkByIdQuery(benchmarkId);
  if (!benchmark) return false;

  const [, affectedRows] = await sequelize.query(
    `UPDATE risks SET
      event_frequency_min = :event_frequency_min,
      event_frequency_likely = :event_frequency_likely,
      event_frequency_max = :event_frequency_max,
      loss_regulatory_min = :loss_regulatory_min,
      loss_regulatory_likely = :loss_regulatory_likely,
      loss_regulatory_max = :loss_regulatory_max,
      loss_operational_min = :loss_operational_min,
      loss_operational_likely = :loss_operational_likely,
      loss_operational_max = :loss_operational_max,
      loss_litigation_min = :loss_litigation_min,
      loss_litigation_likely = :loss_litigation_likely,
      loss_litigation_max = :loss_litigation_max,
      loss_reputational_min = :loss_reputational_min,
      loss_reputational_likely = :loss_reputational_likely,
      loss_reputational_max = :loss_reputational_max,
      benchmark_id = :benchmarkId
    WHERE id = :riskId AND organization_id = :organizationId AND is_deleted = false`,
    {
      replacements: {
        riskId,
        benchmarkId,
        organizationId,
        event_frequency_min: benchmark.event_frequency_min,
        event_frequency_likely: benchmark.event_frequency_likely,
        event_frequency_max: benchmark.event_frequency_max,
        loss_regulatory_min: benchmark.loss_regulatory_min,
        loss_regulatory_likely: benchmark.loss_regulatory_likely,
        loss_regulatory_max: benchmark.loss_regulatory_max,
        loss_operational_min: benchmark.loss_operational_min,
        loss_operational_likely: benchmark.loss_operational_likely,
        loss_operational_max: benchmark.loss_operational_max,
        loss_litigation_min: benchmark.loss_litigation_min,
        loss_litigation_likely: benchmark.loss_litigation_likely,
        loss_litigation_max: benchmark.loss_litigation_max,
        loss_reputational_min: benchmark.loss_reputational_min,
        loss_reputational_likely: benchmark.loss_reputational_likely,
        loss_reputational_max: benchmark.loss_reputational_max,
      },
    }
  );

  return (affectedRows as number) > 0;
}
