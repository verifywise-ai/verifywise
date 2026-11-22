/**
 * @fileoverview Collects the requirements of one bundled framework pairing
 * (SOC 2, GDPR, HIPAA, ...) for the frameworkRequirements report section.
 *
 * @module services/reporting/collectors/frameworkRequirements
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getStructureById } from "../../../structures";
import type {
  FrameworkRequirementGroup,
  FrameworkRequirementRollup,
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { isoDate } from "../dateUtils";
import type { FrameworkTarget } from "../reportScope";
import {
  EVIDENCE_SQL,
  l2RequirementsSql,
  l3RequirementsSql,
  riskCountsSql,
} from "./frameworkRequirements.queries";

const MAX_EVIDENCE_FILES = 10;
const UNKNOWN_USER = "Unknown user";
// Same completed states as addStatusCounts in frameworkImpl.utils.ts.
const DONE_STATUSES = new Set(["Implemented", "Audited"]);

type ImplRow = Record<string, any>;

export const isBundledFrameworkId = (id: number): boolean => getStructureById(id) !== null;

const emptyRollup = (): FrameworkRequirementRollup => ({
  total: 0,
  done: 0,
  unassigned: 0,
  noEvidence: 0,
  overdue: 0,
  statusBreakdown: {},
});

const addRow = (rollup: FrameworkRequirementRollup, row: FrameworkRequirementRow) => {
  rollup.total += 1;
  if (row.isDone) rollup.done += 1;
  if (row.owner === null) rollup.unassigned += 1;
  if (row.evidenceCount === 0) rollup.noEvidence += 1;
  if (row.isOverdue) rollup.overdue += 1;
  rollup.statusBreakdown[row.status] = (rollup.statusBreakdown[row.status] ?? 0) + 1;
};

const mergeRollup = (into: FrameworkRequirementRollup, from: FrameworkRequirementRollup) => {
  into.total += from.total;
  into.done += from.done;
  into.unassigned += from.unassigned;
  into.noEvidence += from.noEvidence;
  into.overdue += from.overdue;
  for (const [k, v] of Object.entries(from.statusBreakdown)) {
    into.statusBreakdown[k] = (into.statusBreakdown[k] ?? 0) + v;
  }
};

export async function collectFrameworkRequirements(
  target: FrameworkTarget,
  organizationId: number,
  generatedAt: Date,
  resolveUserNames: (ids: unknown[]) => Promise<Map<number, string>>,
): Promise<FrameworkRequirementsSectionData> {
  const structure = getStructureById(target.frameworkId);
  if (!structure) throw new Error(`Not a bundled framework: ${target.frameworkId}`);

  const today = isoDate(generatedAt);
  if (!today) throw new Error("Invalid generatedAt");

  const { entity_types, tables, cols } = structure;
  const replacements = { organizationId, pfId: target.projectFrameworkId };
  const select = <T = ImplRow>(sql: string, extra: Record<string, unknown> = {}) =>
    sequelize.query(sql, {
      replacements: { ...replacements, ...extra },
      type: QueryTypes.SELECT,
    }) as Promise<T[]>;

  const l2Rows = await select(l2RequirementsSql(structure));
  const l3Sql = l3RequirementsSql(structure);
  const l3Rows = l2Rows.length > 0 && l3Sql ? await select(l3Sql) : [];

  const l2Ids = l2Rows.map((r) => r.impl_id as number);
  const l3Ids = l3Rows.map((r) => r.impl_id as number);
  const implIds = [...l2Ids, ...l3Ids];

  // (entity_type, entity_id) -> file names
  const evidence = new Map<string, string[]>();
  const l2Risks = new Map<number, number>();
  const l3Risks = new Map<number, number>();

  if (implIds.length > 0) {
    const links = await select<{
      entity_type: string;
      entity_id: number;
      file_id: number;
      filename: string;
    }>(EVIDENCE_SQL, { frameworkType: structure.framework_type, implIds });
    const seen = new Set<string>();
    for (const l of links) {
      const key = `${l.entity_type}:${l.entity_id}`;
      const linkKey = `${key}:${l.file_id}`;
      if (seen.has(linkKey)) continue;
      seen.add(linkKey);
      const list = evidence.get(key) ?? [];
      list.push(l.filename);
      evidence.set(key, list);
    }

    const loadRisks = async (
      table: string | undefined,
      col: string | undefined,
      ids: number[],
      into: Map<number, number>,
    ) => {
      if (!table || !col || ids.length === 0) return;
      const rows = await select<{ impl_id: number; count: number }>(riskCountsSql(table, col), {
        implIds: ids,
      });
      for (const r of rows) into.set(Number(r.impl_id), Number(r.count));
    };
    await loadRisks(tables.l2_risks, cols.l2_risks_impl, l2Ids, l2Risks);
    await loadRisks(tables.l3_risks, cols.l3_risks_impl, l3Ids, l3Risks);
  }

  const userIds = new Set<unknown>();
  for (const r of [...l2Rows, ...l3Rows]) {
    for (const k of ["owner", "reviewer", "approver"]) if (r[k] != null) userIds.add(r[k]);
  }
  const userNames = userIds.size > 0 ? await resolveUserNames([...userIds]) : new Map();
  const nameOf = (id: unknown): string | null =>
    id == null ? null : (userNames.get(Number(id)) ?? UNKNOWN_USER);

  const toRow = (
    r: ImplRow,
    level: 2 | 3,
    entityType: string | undefined,
    risks: Map<number, number>,
  ): FrameworkRequirementRow => {
    const files = evidence.get(`${entityType}:${r.impl_id}`) ?? [];
    const status = r.status ?? "Not started";
    const dueDate = isoDate(r.due_date) ?? null;
    const isDone = DONE_STATUSES.has(status);
    return {
      implId: Number(r.impl_id),
      level,
      title: r.title,
      orderNo: Number(r.order_no ?? 0),
      status,
      owner: nameOf(r.owner),
      reviewer: nameOf(r.reviewer),
      approver: nameOf(r.approver),
      dueDate,
      isDone,
      isOverdue: !isDone && dueDate !== null && dueDate < today,
      evidenceCount: files.length,
      evidenceFiles: [...files].sort().slice(0, MAX_EVIDENCE_FILES),
      riskCount: risks.get(Number(r.impl_id)) ?? 0,
    };
  };

  // L3 children, matched to their L2 row by impl parent column when the
  // framework has one, else (or when it matches nothing) by struct parent.
  const l2ByImpl = new Map<number, FrameworkRequirementRow>();
  const l2ByStruct = new Map<number, FrameworkRequirementRow>();
  const rowsByGroup = new Map<string, { title: string; orderNo: number; rows: ImplRow[] }>();
  const l2Built: Array<{ group: string; row: FrameworkRequirementRow }> = [];

  for (const r of l2Rows) {
    const row = toRow(r, 2, entity_types.l2_impl, l2Risks);
    l2ByImpl.set(row.implId, row);
    l2ByStruct.set(Number(r.struct_id), row);
    const key = String(r.group_id);
    if (!rowsByGroup.has(key)) {
      rowsByGroup.set(key, { title: r.group_title, orderNo: Number(r.group_order ?? 0), rows: [] });
    }
    rowsByGroup.get(key)!.rows.push(r);
    l2Built.push({ group: key, row });
  }

  const l3Built: FrameworkRequirementRow[] = [];
  for (const r of l3Rows) {
    const child = toRow(r, 3, entity_types.l3_impl, l3Risks);
    const parent =
      (r.parent_impl_id != null ? l2ByImpl.get(Number(r.parent_impl_id)) : undefined) ??
      l2ByStruct.get(Number(r.parent_struct_id));
    if (!parent) continue; // orphan impl row: cannot be placed under a requirement
    (parent.children ??= []).push(child);
    l3Built.push(child);
  }
  for (const { row } of l2Built) {
    row.children?.sort((a, b) => a.orderNo - b.orderNo);
  }

  const groups = new Map<string, FrameworkRequirementGroup>();
  for (const [key, g] of rowsByGroup) {
    groups.set(key, {
      title: g.title,
      orderNo: g.orderNo,
      requirements: [],
      rollup: emptyRollup(),
    });
  }
  for (const { group, row } of l2Built) {
    const g = groups.get(group)!;
    g.requirements.push(row);
    addRow(g.rollup, row);
    for (const c of row.children ?? []) addRow(g.rollup, c);
  }

  const orderedGroups = [...groups.values()].sort((a, b) => a.orderNo - b.orderNo);
  for (const g of orderedGroups) g.requirements.sort((a, b) => a.orderNo - b.orderNo);

  const rollup = emptyRollup();
  for (const g of orderedGroups) mergeRollup(rollup, g.rollup);

  return {
    frameworks: [
      {
        frameworkId: target.frameworkId,
        frameworkName: target.frameworkName,
        groups: orderedGroups,
        rollup,
      },
    ],
  };
}
