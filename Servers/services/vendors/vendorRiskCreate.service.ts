import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { IVendorRisk } from "../../domain.layer/interfaces/i.vendorRisk";
import { VendorRiskModel } from "../../domain.layer/models/vendorRisk/vendorRisk.model";
import logger from "../../utils/logger/fileLogger";
import { getVendorNoticeContextQuery } from "../../utils/riskLink.utils";
import {
  createNewVendorRiskQuery,
  createVendorRiskFrameworkAssociations,
} from "../../utils/vendorRisk.utils";
import { recordVendorRiskCreation } from "../../utils/vendorRiskChangeHistory.utils";
import { enqueueVendorRiskLinkRecompute } from "../automations/automationProducer";
import { notifyUserAssigned } from "../inAppNotification.service";
import { notifyVendorRiskCandidates } from "../riskLinks/vendorCandidates";

/**
 * Creating a vendor risk does more than insert a row. The rules live here, in two halves, so any
 * flow that creates a vendor risk behaves exactly like the vendor risk form:
 *
 * 1. `createVendorRiskInTransaction`: the insert, framework links and change history, all inside
 *    a transaction the caller owns and later commits or rolls back.
 * 2. `runVendorRiskPostCommitEffects`: what follows once that transaction has committed.
 */

export interface CreateVendorRiskInput {
  vendor_id: number;
  risk_description: string;
  impact_description: string;
  likelihood: IVendorRisk["likelihood"];
  risk_severity: IVendorRisk["risk_severity"];
  action_plan: string;
  action_owner: number | null;
  risk_level: string;
  frameworks?: number[];
}

const UNKNOWN_ASSIGNER = "Someone";

const RECOMPUTE_ENQUEUE_FAILED = "Vendor risk link recompute enqueue failed:";
const CANDIDATE_NOTICE_FAILED = "Vendor risk candidate notice failed:";
const ACTION_OWNER_NOTICE_FAILED = "Failed to send action owner notification:";

async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return UNKNOWN_ASSIGNER;
}

/**
 * Insert a vendor risk, link its frameworks and record its creation, inside `transaction`.
 *
 * Neither commits nor rolls back: that stays with the caller. Returns null when the insert
 * yields no row; a failed insert or history write rejects, so the caller can roll back.
 */
export async function createVendorRiskInTransaction(
  input: CreateVendorRiskInput,
  userId: number | undefined,
  organizationId: number,
  transaction: Transaction,
): Promise<VendorRiskModel | null> {
  // The factory is typed for IVendorRisk, whose action_owner predates unassigned owners; it
  // copies the field as it is, null included.
  const vendorRiskModel = await VendorRiskModel.createNewVendorRisk(input as IVendorRisk);

  const created = await createNewVendorRiskQuery(vendorRiskModel, organizationId, transaction);
  if (!created) return null;

  // Create framework associations if provided
  const { frameworks } = input;
  if (frameworks && frameworks.length > 0 && created.id) {
    try {
      await createVendorRiskFrameworkAssociations(
        frameworks,
        created.id,
        organizationId,
        transaction,
      );
    } catch (fwError) {
      // The logger has no format.splat(): a detail passed as a second argument never reaches
      // the log line, so it goes into the message.
      logger.warn(
        `Could not create framework associations (table may not exist yet): ${(fwError as Error).message}`,
      );
    }
  }

  // Record creation in change history
  if (userId && created.id) {
    await recordVendorRiskCreation(created.id, userId, organizationId, created, transaction);
  }

  return created;
}

/**
 * Start `effect` and return at once. The save has already committed, so a failure (a queue
 * outage, a mail error) is logged and goes no further. Covers a synchronous throw as well as a
 * rejected promise.
 */
function launch(failureMessage: string, effect: () => Promise<unknown>): void {
  void (async () => {
    try {
      await effect();
    } catch (err) {
      logger.error(failureMessage, err);
    }
  })();
}

async function notifyActionOwner(
  created: VendorRiskModel,
  vendorRiskId: number,
  actionOwnerId: number,
  userId: number | undefined,
  organizationId: number,
): Promise<void> {
  const assignerName = userId ? await getUserNameById(userId) : UNKNOWN_ASSIGNER;
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  // Get vendor name for context
  let vendorName: string | undefined;
  if (created.vendor_id) {
    const vendorResult = await sequelize.query<{ vendor_name: string }>(
      `SELECT vendor_name FROM vendors WHERE organization_id = :organizationId AND id = :vendorId`,
      {
        replacements: { organizationId, vendorId: created.vendor_id },
        type: QueryTypes.SELECT,
      },
    );
    vendorName = vendorResult[0]?.vendor_name;
  }

  launch(ACTION_OWNER_NOTICE_FAILED, () =>
    notifyUserAssigned(
      organizationId,
      actionOwnerId,
      {
        entityType: "Vendor Risk",
        entityId: vendorRiskId,
        entityName: created.risk_description || `Vendor Risk #${vendorRiskId}`,
        roleType: "Action Owner",
        entityUrl: `${baseUrl}/vendors?vendorRiskId=${vendorRiskId}`,
      },
      assignerName,
      baseUrl,
      {
        parentType: vendorName ? "Vendor" : undefined,
        parentName: vendorName,
        description: created.impact_description || undefined,
      },
    ),
  );
}

/**
 * What follows a committed vendor risk: the related-risk recompute, the candidate notice for
 * project risk owners and the action owner's assignment notice. Call it after the transaction
 * committed, never inside it.
 *
 * Never rejects, and one failing effect does not stop the others. Each effect is fire-and-forget
 * as before: only the two lookups the assignment notice needs are awaited.
 */
export async function runVendorRiskPostCommitEffects(
  created: VendorRiskModel,
  userId: number | undefined,
  organizationId: number,
): Promise<void> {
  const vendorRiskId = created.id;
  if (!vendorRiskId) return;

  // Related vendor risks are suggested in the background, like project
  // risk links on save. Fire-and-forget: a queue outage must not fail the save.
  launch(RECOMPUTE_ENQUEUE_FAILED, () =>
    enqueueVendorRiskLinkRecompute(organizationId, vendorRiskId),
  );

  // A new vendor risk on a vendor with use cases is the most direct cause
  // of new candidates: announce this vendor risk to the owners of project
  // risks in those use cases. Fire-and-forget.
  if (created.vendor_id) {
    const vendorId = created.vendor_id;
    launch(CANDIDATE_NOTICE_FAILED, async () => {
      const context = await getVendorNoticeContextQuery(organizationId, vendorId);
      if (!context || context.projectIds.length === 0) return;
      await notifyVendorRiskCandidates({
        organizationId,
        vendorId,
        vendorName: context.name,
        projectIds: context.projectIds,
        vendorRiskIds: [vendorRiskId],
      });
    });
  }

  // Notify action_owner if assigned
  const actionOwnerId = created.action_owner;
  if (actionOwnerId) {
    try {
      await notifyActionOwner(created, vendorRiskId, actionOwnerId, userId, organizationId);
    } catch (err) {
      logger.error(ACTION_OWNER_NOTICE_FAILED, err);
    }
  }
}
