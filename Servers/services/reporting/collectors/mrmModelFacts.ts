/**
 * @fileoverview Collects one facts row per model inventory entry for the OSFI
 * E-23 report: tiering, MRM roles, validations, findings and monitoring, plus
 * activity within the report period.
 *
 * Retired models are returned (flagged) because the inventory appendix lists
 * them; the fleet status, contradiction rules and fix-it list skip them.
 *
 * @module services/reporting/collectors/mrmModelFacts
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import type {
  MrmActivity,
  MrmModelFacts,
  MrmTierValue,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import type { MrmValidationReport } from "../../../domain.layer/interfaces/i.mrmValidation";
import {
  ACTIVE_THRESHOLDS_SQL,
  BREACHES_IN_PERIOD_SQL,
  FINDINGS_SQL,
  LAST_METRIC_SQL,
  LATEST_SIGNED_OFF_SQL,
  MODELS_SQL,
  OPEN_VALIDATIONS_SQL,
  REVALIDATION_EVENTS_IN_PERIOD_SQL,
  ROLES_SQL,
  SIGNED_OFF_IN_PERIOD_SQL,
} from "./mrmModelFacts.queries";

export const VALIDATION_REPORT_SECTIONS: ReadonlyArray<keyof MrmValidationReport> = [
  "purpose_scope",
  "conceptual_soundness",
  "data_review",
  "outcomes_analysis",
  "findings_limitations",
  "conclusion_signoff",
];

const RETIRED = "Retired";
const TIERS = new Set<string>(["1", "2", "3"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Row = Record<string, any>;
type CountRow = { model_inventory_id: number; count: number };

const toIso = (value: unknown): string | null => {
  if (value == null) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const toId = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

const isBlank = (value: unknown): boolean => typeof value !== "string" || value.trim() === "";

/** Report sections that are missing or whose text is empty after trimming. */
export const emptyReportSections = (report: unknown): string[] => {
  let parsed: unknown = report;
  if (typeof report === "string") {
    try {
      parsed = JSON.parse(report);
    } catch {
      parsed = null;
    }
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return VALIDATION_REPORT_SECTIONS.filter((key) => {
    const section = obj[key];
    return !section || typeof section !== "object" || isBlank((section as Row).text);
  });
};

/** [from, to): period start 00:00 UTC to the day after period end, 00:00 UTC. */
const periodBounds = (period: { start: string; end: string }) => {
  const parse = (day: string) => {
    const t = ISO_DAY.test(day) ? Date.parse(`${day}T00:00:00.000Z`) : NaN;
    if (Number.isNaN(t)) throw new Error(`Invalid report period date: ${day}`);
    return t;
  };
  const from = parse(period.start);
  const to = parse(period.end) + DAY_MS;
  if (to <= from) throw new Error("Report period ends before it starts");
  return { from: new Date(from), to: new Date(to) };
};

const emptyActivity = (period: MrmActivity["period"]): MrmActivity => ({
  period,
  validationsSignedOff: 0,
  findingsOpened: 0,
  findingsClosed: 0,
  breaches: 0,
  revalidationEvents: 0,
});

export async function collectMrmModelFacts(
  organizationId: number,
  generatedAt: Date,
  period: { start: string; end: string } | null,
  resolveUserNames: (ids: unknown[]) => Promise<Map<number, string>>,
): Promise<{ models: MrmModelFacts[]; activity: MrmActivity }> {
  if (Number.isNaN(generatedAt.getTime())) throw new Error("Invalid generatedAt");
  const bounds = period ? periodBounds(period) : null;

  const select = <T = Row>(sql: string, extra: Record<string, unknown> = {}) =>
    sequelize.query(sql, {
      replacements: { organizationId, ...extra },
      type: QueryTypes.SELECT,
    }) as Promise<T[]>;

  const [modelRows, roleRows, signedOffRows, openRows, findingRows, thresholdRows, metricRows] =
    await Promise.all([
      select(MODELS_SQL),
      select(ROLES_SQL),
      select(LATEST_SIGNED_OFF_SQL),
      select(OPEN_VALIDATIONS_SQL),
      select(FINDINGS_SQL),
      select<CountRow>(ACTIVE_THRESHOLDS_SQL),
      select(LAST_METRIC_SQL),
    ]);

  const userIds = new Set<number>();
  for (const r of roleRows) {
    const id = toId(r.user_id);
    if (id !== null) userIds.add(id);
  }
  for (const m of modelRows) {
    const id = toId(m.approver);
    if (id !== null) userIds.add(id);
  }
  const names = userIds.size > 0 ? await resolveUserNames([...userIds]) : new Map();

  const byModel = <T>(rows: Row[], map: (r: Row) => T) => {
    const out = new Map<number, T[]>();
    for (const r of rows) {
      const id = Number(r.model_inventory_id);
      const list = out.get(id) ?? [];
      list.push(map(r));
      out.set(id, list);
    }
    return out;
  };

  const rolesByModel = byModel(roleRows, (r) => ({
    role: String(r.role),
    userId: toId(r.user_id),
  }));
  const signedOffByModel = new Map(signedOffRows.map((r) => [Number(r.model_inventory_id), r]));
  const openByModel = new Map(openRows.map((r) => [Number(r.model_inventory_id), r]));
  const findingsByModel = byModel(findingRows, (r) => r);
  const thresholdsByModel = new Map(
    thresholdRows.map((r) => [Number(r.model_inventory_id), Number(r.count)]),
  );
  const metricByModel = new Map(
    metricRows.map((r) => [Number(r.model_inventory_id), toIso(r.last_received_at)]),
  );

  const models: MrmModelFacts[] = modelRows.map((m) => {
    const id = Number(m.id);
    const roles = rolesByModel.get(id) ?? [];
    const namesFor = (role: string) => [
      ...new Set(
        roles
          .filter((r) => r.role === role && r.userId !== null && names.has(r.userId))
          .map((r) => names.get(r.userId!) as string),
      ),
    ];
    const signedOff = signedOffByModel.get(id);
    const open = openByModel.get(id);
    const approverId = toId(m.approver);
    const tier = m.mrm_tier != null && TIERS.has(String(m.mrm_tier)) ? String(m.mrm_tier) : null;

    return {
      id,
      name: m.model ?? "",
      version: m.version ?? null,
      provider: m.provider ?? null,
      type: m.type ?? null,
      status: m.status ?? null,
      retired: m.status === RETIRED,
      tier: tier as MrmTierValue | null,
      tieredAt: toIso(m.mrm_tiered_at),
      revalidationFlagged: m.mrm_revalidation_flagged === true,
      intendedUse: m.intended_use ?? null,
      limitations: m.limitations ?? null,
      inventoryApproverId: approverId,
      inventoryApprover: approverId !== null ? (names.get(approverId) ?? null) : null,
      roles: {
        owner: namesFor("owner"),
        developerIds: [
          ...new Set(
            roles.filter((r) => r.role === "developer" && r.userId !== null).map((r) => r.userId!),
          ),
        ],
        validator: namesFor("validator"),
        approver: namesFor("approver"),
      },
      hasOpenValidation: open !== undefined,
      openValidationNextDue: open ? toIso(open.next_due) : null,
      latestSignedOff: signedOff
        ? {
            validatorId: toId(signedOff.validator_id),
            outcome: signedOff.outcome ?? null,
            signedOffAt: toIso(signedOff.signed_off_at) as string,
            emptyReportSections: emptyReportSections(signedOff.report),
          }
        : null,
      nextReviewDue: signedOff ? toIso(signedOff.next_due) : null,
      activeThresholds: thresholdsByModel.get(id) ?? 0,
      lastMetricReceivedAt: metricByModel.get(id) ?? null,
      findings: (findingsByModel.get(id) ?? []).map((f) => ({
        severity: String(f.severity),
        stage: String(f.stage),
        dueDate: toIso(f.due_date),
        remediationPlanEmpty: isBlank(f.remediation_plan),
      })),
    };
  });

  if (!period || !bounds) return { models, activity: emptyActivity(null) };

  // Activity counts only models that are in this organization and not retired.
  const live = new Set(models.filter((m) => !m.retired).map((m) => m.id));
  const range = { from: bounds.from, to: bounds.to };
  const inRange = (value: unknown) => {
    const iso = toIso(value);
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= bounds.from.getTime() && t < bounds.to.getTime();
  };
  const sum = (rows: CountRow[]) =>
    rows.reduce((n, r) => (live.has(Number(r.model_inventory_id)) ? n + Number(r.count) : n), 0);

  const [signedOffInPeriod, breaches, revalidations] = await Promise.all([
    select<CountRow>(SIGNED_OFF_IN_PERIOD_SQL, range),
    select<CountRow>(BREACHES_IN_PERIOD_SQL, range),
    select<CountRow>(REVALIDATION_EVENTS_IN_PERIOD_SQL, range),
  ]);
  const liveFindings = findingRows.filter((f) => live.has(Number(f.model_inventory_id)));

  return {
    models,
    activity: {
      period: { start: period.start, end: period.end },
      validationsSignedOff: sum(signedOffInPeriod),
      findingsOpened: liveFindings.filter((f) => inRange(f.created_at)).length,
      findingsClosed: liveFindings.filter((f) => inRange(f.closed_at)).length,
      breaches: sum(breaches),
      revalidationEvents: sum(revalidations),
    },
  };
}
