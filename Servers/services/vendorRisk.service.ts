/**
 * Creating, updating and deleting vendor risks, shared by the console
 * (/api/vendorRisks) and the Advisor's vendor risk tools, so a write from
 * either is the same write: same validation, framework links, change history,
 * related vendor risk rescoring and action owner notice.
 *
 * The caller checks vendor.edit first and validates the request body
 * (assertVendorRiskRequestBody). Validation errors are thrown
 * (ValidationException) for the caller to answer.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type { IVendorRisk } from "../domain.layer/interfaces/i.vendorRisk";
import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import {
  createNewVendorRiskQuery,
  createVendorRiskFrameworkAssociations,
  deleteVendorRiskByIdQuery,
  deleteVendorRiskFrameworkAssociations,
  getVendorRiskByIdQuery,
  normalizeVendorRiskLikelihood,
  updateVendorRiskByIdQuery,
} from "../utils/vendorRisk.utils";
import {
  recordMultipleFieldChanges,
  recordVendorRiskCreation,
} from "../utils/vendorRiskChangeHistory.utils";
import { trackEntityChanges } from "../utils/changeHistory.base.utils";
import { assertFrameworksExist, toIdList } from "../utils/validations/vendorRequest.utils";
import { getVendorNoticeContextQuery } from "../utils/riskLink.utils";
import { notifyUserAssigned } from "./inAppNotification.service";
import { notifyVendorRiskCandidates } from "./riskLinks/vendorCandidates";
import { enqueueVendorRiskLinkRecompute } from "./automations/automationProducer";
import { actorDisplayName } from "./vendor.service";
import { frontendBaseUrl } from "../utils/frontendUrl.utils";
import logger from "../utils/logger/fileLogger";

/**
 * A vendor risk's fields as the console sends them, checked by
 * assertVendorRiskRequestBody. `frameworks` replaces the framework links;
 * absent or null leaves them alone on update.
 */
export type VendorRiskInput = Record<string, any> & { frameworks?: unknown };

/** Who makes the change; history is recorded only when the user is known. */
export interface VendorRiskActor {
  userId?: number;
  organizationId: number;
}

/** The action owner notice, with the vendor's name for context. Never throws. */
async function notifyActionOwner(
  actor: VendorRiskActor,
  risk: VendorRiskModel,
  actionOwnerId: number,
): Promise<void> {
  try {
    const assignerName = await actorDisplayName(actor.userId);
    const baseUrl = frontendBaseUrl();
    let vendorName: string | undefined;
    if (risk.vendor_id) {
      const rows = await sequelize.query<{ vendor_name: string }>(
        `SELECT vendor_name FROM vendors WHERE organization_id = :organizationId AND id = :vendorId`,
        {
          replacements: { organizationId: actor.organizationId, vendorId: risk.vendor_id },
          type: QueryTypes.SELECT,
        },
      );
      vendorName = rows[0]?.vendor_name;
    }
    notifyUserAssigned(
      actor.organizationId,
      actionOwnerId,
      {
        entityType: "Vendor Risk",
        entityId: risk.id!,
        entityName: risk.risk_description || `Vendor Risk #${risk.id}`,
        roleType: "Action Owner",
        entityUrl: `${baseUrl}/vendors?vendorRiskId=${risk.id}`,
      },
      assignerName,
      baseUrl,
      {
        parentType: vendorName ? "Vendor" : undefined,
        parentName: vendorName,
        description: risk.impact_description || undefined,
      },
    ).catch((err) => logger.error("Failed to send action owner notification:", err));
  } catch (error) {
    logger.error("Failed to send action owner notification:", error);
  }
}

const recompute = (organizationId: number, vendorRiskId: number) =>
  enqueueVendorRiskLinkRecompute(organizationId, vendorRiskId).catch((err) =>
    logger.error("Vendor risk link recompute enqueue failed:", err),
  );

/** Create a vendor risk; null when the insert returned nothing. */
export async function createVendorRisk(
  input: VendorRiskInput,
  actor: VendorRiskActor,
): Promise<VendorRiskModel | null> {
  const frameworks = toIdList(input.frameworks);
  const transaction = await sequelize.transaction();
  let created: VendorRiskModel;
  try {
    // Checked before the insert: a foreign key error on the links would
    // abort the transaction and leave nothing to commit.
    await assertFrameworksExist(frameworks, transaction);
    const vendorRiskModel = await VendorRiskModel.createNewVendorRisk(input as VendorRiskModel);
    const result = await createNewVendorRiskQuery(
      vendorRiskModel,
      actor.organizationId,
      transaction,
    );
    if (!result || !result.id) {
      await transaction.rollback();
      return null;
    }
    created = result;

    if (frameworks.length > 0) {
      await createVendorRiskFrameworkAssociations(
        frameworks,
        created.id!,
        actor.organizationId,
        transaction,
      );
    }
    if (actor.userId) {
      await recordVendorRiskCreation(
        created.id!,
        actor.userId,
        actor.organizationId,
        { ...created.toJSON(), frameworks: frameworks.length > 0 ? frameworks : undefined },
        transaction,
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Fire-and-forget from here: none of it may fail the save.
  // Related vendor risks are suggested in the background.
  recompute(actor.organizationId, created.id!);

  // A new vendor risk on a vendor with use cases is the most direct cause of
  // new candidates: announce it to the owners of project risks in those use cases.
  if (created.vendor_id) {
    const vendorId = created.vendor_id;
    const vendorRiskId = created.id!;
    getVendorNoticeContextQuery(actor.organizationId, vendorId)
      .then(async (context) => {
        if (!context || context.projectIds.length === 0) return;
        await notifyVendorRiskCandidates({
          organizationId: actor.organizationId,
          vendorId,
          vendorName: context.name,
          projectIds: context.projectIds,
          vendorRiskIds: [vendorRiskId],
        });
      })
      .catch((err) => logger.error("Vendor risk candidate notice failed:", err));
  }

  if (created.action_owner) await notifyActionOwner(actor, created, created.action_owner);

  return created;
}

/**
 * Update a vendor risk; null when no active vendor risk has this id in the
 * organization.
 */
export async function updateVendorRisk(
  vendorRiskId: number,
  input: VendorRiskInput,
  actor: VendorRiskActor,
): Promise<VendorRiskModel | null> {
  // Likelihood in its enum spelling, so the history diff doesn't record
  // "Almost certain → Almost Certain" for a save that changes nothing.
  const fields =
    input.likelihood === undefined
      ? input
      : { ...input, likelihood: normalizeVendorRiskLikelihood(input.likelihood) };
  // null, like absent, leaves the framework links alone.
  const frameworks: number[] | undefined =
    input.frameworks == null ? undefined : toIdList(input.frameworks);

  const transaction = await sequelize.transaction();
  let existing: Awaited<ReturnType<typeof getVendorRiskByIdQuery>>;
  let vendorRisk: VendorRiskModel;
  try {
    existing = await getVendorRiskByIdQuery(vendorRiskId, actor.organizationId);
    if (!existing) {
      await transaction.rollback();
      return null;
    }
    if (frameworks) await assertFrameworksExist(frameworks, transaction);

    const vendorRiskModel = new VendorRiskModel();
    await vendorRiskModel.updateVendorRisk(fields as Partial<IVendorRisk>);
    const updated = await updateVendorRiskByIdQuery(
      vendorRiskId,
      vendorRiskModel,
      actor.organizationId,
      transaction,
    );
    if (!updated) {
      await transaction.rollback();
      return null;
    }
    vendorRisk = updated;

    if (frameworks !== undefined) {
      await deleteVendorRiskFrameworkAssociations(vendorRiskId, actor.organizationId, transaction);
      if (frameworks.length > 0) {
        await createVendorRiskFrameworkAssociations(
          frameworks,
          vendorRiskId,
          actor.organizationId,
          transaction,
        );
      }
    }

    if (actor.userId) {
      // The level as stored (computed), not as the input sent it. Name
      // lookups scoped to this organization, on the write's transaction.
      const changes = await trackEntityChanges(
        "vendor_risk",
        { ...existing, frameworks: existing.frameworks ?? [] },
        {
          ...fields,
          risk_level: vendorRisk.risk_level,
          vendor_id: fields.vendor_id === undefined ? undefined : vendorRisk.vendor_id,
          frameworks,
        },
        { organizationId: actor.organizationId, transaction },
      );
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          vendorRiskId,
          actor.userId,
          actor.organizationId,
          changes,
          transaction,
        );
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Wording, vendor or frameworks may have changed: rescore its pairs.
  recompute(actor.organizationId, vendorRiskId);

  // The saved value, not the input's: the form sends the id as a string.
  const newActionOwner = vendorRisk.action_owner;
  if (newActionOwner && Number(newActionOwner) !== Number((existing as any).action_owner)) {
    await notifyActionOwner(actor, vendorRisk, newActionOwner);
  }

  return vendorRisk;
}

/**
 * Delete a vendor risk (soft: it can be restored). False when no active
 * vendor risk has this id in the organization. A deletion with no known user
 * is recorded as the system's.
 */
export async function deleteVendorRisk(
  vendorRiskId: number,
  actor: VendorRiskActor,
): Promise<boolean> {
  const transaction = await sequelize.transaction();
  try {
    const deleted = await deleteVendorRiskByIdQuery(
      vendorRiskId,
      actor.organizationId,
      transaction,
      actor.userId,
    );
    if (!deleted) {
      await transaction.rollback();
      return false;
    }
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
