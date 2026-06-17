/**
 * ISO 42001 assignment notification service.
 *
 * Sends in-app notifications when a subclause or annex-category owner,
 * reviewer, or approver changes. Looks up parent (clause / annex) metadata
 * so the notification renders a fully-qualified identifier like
 * "4.1 Understanding the organization" or "A.5.1 Policies for AI".
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import {
  notifyUserAssigned,
  AssignmentRoleType,
} from "../inAppNotification.service";

export type Iso42001EntityType = "ISO 42001 Subclause" | "ISO 42001 Annex";

interface SubClauseParentInfo {
  clauseId: number;
  parentName: string;
  qualifiedEntityName: string;
  description: string | undefined;
  urlPath: string;
}

interface AnnexCategoryParentInfo {
  annexId: number;
  parentName: string;
  qualifiedEntityName: string;
  description: string | undefined;
  urlPath: string;
}

async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

async function getSubClauseParentInfo(
  organizationId: number,
  entityId: number,
  entityName: string,
): Promise<SubClauseParentInfo | null> {
  const result = await sequelize.query<{
    clause_id: number;
    clause_no: number;
    clause_title: string;
    subclause_order_no: number;
    summary: string;
  }>(
    `SELECT scs.clause_id, c.clause_no, c.title as clause_title, scs.order_no as subclause_order_no, scs.summary
     FROM subclauses_iso sc
     JOIN subclauses_struct_iso scs ON sc.subclause_meta_id = scs.id
     JOIN clauses_struct_iso c ON scs.clause_id = c.id
     WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
    {
      replacements: { organizationId, entityId },
      type: QueryTypes.SELECT,
    },
  );

  if (!result[0]) {
    return {
      clauseId: 0,
      parentName: "",
      qualifiedEntityName: entityName,
      description: undefined,
      urlPath: `/framework?framework=iso-42001&subClauseId=${entityId}`,
    };
  }

  const row = result[0];
  return {
    clauseId: row.clause_id,
    parentName: row.clause_title,
    qualifiedEntityName: `${row.clause_no}.${row.subclause_order_no} ${entityName}`,
    description: row.summary,
    urlPath: row.clause_id
      ? `/framework?framework=iso-42001&clauseId=${row.clause_id}&subClauseId=${entityId}`
      : `/framework?framework=iso-42001&subClauseId=${entityId}`,
  };
}

async function getAnnexCategoryParentInfo(
  organizationId: number,
  entityId: number,
  entityName: string,
): Promise<AnnexCategoryParentInfo | null> {
  const result = await sequelize.query<{
    annex_id: number;
    annex_no: number;
    annex_title: string;
    category_sub_id: number;
    category_description: string;
  }>(
    `SELECT acs.annex_id, a.annex_no, a.title as annex_title, acs.sub_id as category_sub_id, acs.description as category_description
     FROM annexcategories_iso ac
     JOIN annexcategories_struct_iso acs ON ac.annexcategory_meta_id = acs.id
     JOIN annex_struct_iso a ON acs.annex_id = a.id
     WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
    {
      replacements: { organizationId, entityId },
      type: QueryTypes.SELECT,
    },
  );

  if (!result[0]) {
    return {
      annexId: 0,
      parentName: "",
      qualifiedEntityName: entityName,
      description: undefined,
      urlPath: `/framework?framework=iso-42001&annexCategoryId=${entityId}`,
    };
  }

  const row = result[0];
  return {
    annexId: row.annex_id,
    parentName: row.annex_title,
    qualifiedEntityName: `A.${row.annex_no}.${row.category_sub_id} ${entityName}`,
    description: row.category_description,
    urlPath: row.annex_id
      ? `/framework?framework=iso-42001&annexId=${row.annex_id}&annexCategoryId=${entityId}`
      : `/framework?framework=iso-42001&annexCategoryId=${entityId}`,
  };
}

export interface NotifyIso42001AssignmentArgs {
  organizationId: number;
  assignerUserId: number;
  entityType: Iso42001EntityType;
  entityId: number;
  entityName: string;
  roleType: AssignmentRoleType;
  newUserId: number;
  oldUserId: number | null | undefined;
}

/**
 * Fire-and-forget notification when a subclause / annex-category owner,
 * reviewer, or approver assignment changes. Silently returns if the
 * assignment hasn't changed.
 */
export async function notifyIso42001Assignment(
  args: NotifyIso42001AssignmentArgs,
): Promise<void> {
  const {
    organizationId,
    assignerUserId,
    entityType,
    entityId,
    entityName,
    roleType,
    newUserId,
    oldUserId,
  } = args;

  if (!newUserId || newUserId === oldUserId) {
    return;
  }

  const assignerName = await getUserNameById(assignerUserId);
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const parentInfo =
    entityType === "ISO 42001 Subclause"
      ? await getSubClauseParentInfo(organizationId, entityId, entityName)
      : await getAnnexCategoryParentInfo(organizationId, entityId, entityName);

  if (!parentInfo) {
    return;
  }

  notifyUserAssigned(
    organizationId,
    newUserId,
    {
      entityType,
      entityId,
      entityName: parentInfo.qualifiedEntityName,
      roleType,
      entityUrl: `${baseUrl}${parentInfo.urlPath}`,
    },
    assignerName,
    baseUrl,
    {
      frameworkName: "ISO 42001",
      parentType: entityType === "ISO 42001 Subclause" ? "Clause" : "Annex",
      parentName: parentInfo.parentName,
      description: parentInfo.description,
    },
  ).catch((err) => console.error(`Failed to send ${roleType} notification:`, err));
}
