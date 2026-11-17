/**
 * Use case access for the post-market monitoring routes (see
 * requireUseCaseAccessVia): the use case a config, cycle or report monitors,
 * and whether the caller is the stakeholder assigned to the cycle. Every query
 * is filtered by organization_id; a row outside the organization resolves to
 * null.
 *
 * Kept apart from postMarketMonitoring.utils.ts so the route guard does not
 * touch the queries the handlers use.
 */
import { Request } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type { UseCaseOfChild } from "../middleware/projectAccess.middleware";

const first = async (sql: string, id: number, organizationId: number, userId?: number) => {
  const rows = await sequelize.query<{ value: number | null }>(sql, {
    replacements: { id, organizationId, userId: userId ?? null },
    type: QueryTypes.SELECT,
  });
  return rows[0]?.value ?? null;
};

/** A monitoring config (post_market_monitoring_configs). */
export const useCaseOfPmmConfig: UseCaseOfChild = (id, organizationId) =>
  first(
    `SELECT project_id AS value FROM post_market_monitoring_configs
      WHERE organization_id = :organizationId AND id = :id`,
    id,
    organizationId,
  );

/** A monitoring cycle, through its config. */
export const useCaseOfPmmCycle: UseCaseOfChild = (id, organizationId) =>
  first(
    `SELECT c.project_id AS value
       FROM post_market_monitoring_cycles cy
       JOIN post_market_monitoring_configs c
         ON c.organization_id = cy.organization_id AND c.id = cy.config_id
      WHERE cy.organization_id = :organizationId AND cy.id = :id`,
    id,
    organizationId,
  );

/** A monitoring report, through its cycle and config. */
export const useCaseOfPmmReport: UseCaseOfChild = (id, organizationId) =>
  first(
    `SELECT c.project_id AS value
       FROM post_market_monitoring_reports r
       JOIN post_market_monitoring_cycles cy
         ON cy.organization_id = r.organization_id AND cy.id = r.cycle_id
       JOIN post_market_monitoring_configs c
         ON c.organization_id = cy.organization_id AND c.id = cy.config_id
      WHERE r.organization_id = :organizationId AND r.id = :id`,
    id,
    organizationId,
  );

type StakeholderCheck = (id: number, organizationId: number, req: Request) => Promise<boolean>;

const isStakeholder =
  (sql: string): StakeholderCheck =>
  async (id, organizationId, req) =>
    !!req.userId && (await first(sql, id, organizationId, req.userId)) !== null;

/** The caller is the stakeholder assigned to this cycle. */
export const isStakeholderOfPmmCycle = isStakeholder(
  `SELECT id AS value FROM post_market_monitoring_cycles
    WHERE organization_id = :organizationId AND id = :id
      AND assigned_stakeholder_id = :userId`,
);

/** The caller is the stakeholder of a cycle of this config (to load its questions). */
export const isStakeholderOfPmmConfig = isStakeholder(
  `SELECT id AS value FROM post_market_monitoring_cycles
    WHERE organization_id = :organizationId AND config_id = :id
      AND assigned_stakeholder_id = :userId
    LIMIT 1`,
);

/** The caller is the stakeholder of the cycle this report was generated for. */
export const isStakeholderOfPmmReport = isStakeholder(
  `SELECT cy.id AS value
     FROM post_market_monitoring_reports r
     JOIN post_market_monitoring_cycles cy
       ON cy.organization_id = r.organization_id AND cy.id = r.cycle_id
    WHERE r.organization_id = :organizationId AND r.id = :id
      AND cy.assigned_stakeholder_id = :userId`,
);

/**
 * A monitoring question's use case, through its config. Null for an
 * organization question (no config) as for an unknown id.
 */
export const useCaseOfPmmQuestion: UseCaseOfChild = (id, organizationId) =>
  first(
    `SELECT c.project_id AS value
       FROM post_market_monitoring_questions q
       JOIN post_market_monitoring_configs c
         ON c.organization_id = q.organization_id AND c.id = q.config_id
      WHERE q.organization_id = :organizationId AND q.id = :id`,
    id,
    organizationId,
  );

/** The distinct use cases of these questions (organization questions have none). */
export const useCasesOfPmmQuestionsQuery = async (
  questionIds: number[],
  organizationId: number,
): Promise<number[]> => {
  if (questionIds.length === 0) return [];
  const rows = await sequelize.query<{ project_id: number }>(
    `SELECT DISTINCT c.project_id
       FROM post_market_monitoring_questions q
       JOIN post_market_monitoring_configs c
         ON c.organization_id = q.organization_id AND c.id = q.config_id
      WHERE q.organization_id = :organizationId AND q.id IN (:questionIds)`,
    { replacements: { organizationId, questionIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.project_id);
};

/**
 * Whether every id is a question of the config this cycle runs. A malformed id
 * is false; an empty list is true.
 */
export const questionsBelongToPmmCycleQuery = async (
  cycleId: number,
  questionIds: unknown[],
  organizationId: number,
): Promise<boolean> => {
  const ids = [...new Set(questionIds.map((id) => Number(id)))];
  if (ids.length === 0) return true;
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return false;
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM post_market_monitoring_questions q
       JOIN post_market_monitoring_cycles cy
         ON cy.organization_id = q.organization_id AND cy.config_id = q.config_id
      WHERE q.organization_id = :organizationId AND cy.id = :cycleId AND q.id IN (:ids)`,
    { replacements: { organizationId, cycleId, ids }, type: QueryTypes.SELECT },
  );
  return rows[0]?.n === ids.length;
};
