/**
 * Creating, updating and deleting vendors, shared by the console
 * (/api/vendors) and the Advisor's vendor tools, so a write from either is the
 * same write: same validation, use case visibility, change history, onboarding
 * workflow, assignment notices and related vendor risk rescoring.
 *
 * The caller checks vendor.edit first and validates the request body
 * (assertVendorRequestBody). Validation and demo-vendor errors are thrown
 * (ValidationException, BusinessLogicException) for the caller to answer.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import type { IVendor } from "../domain.layer/interfaces/i.vendor";
import {
  createNewVendorQuery,
  deleteVendorByIdQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
  visibleVendorProjectIds,
} from "../utils/vendor.utils";
import {
  recordMultipleFieldChanges,
  recordVendorCreation,
} from "../utils/vendorChangeHistory.utils";
import { trackEntityChanges } from "../utils/changeHistory.base.utils";
import { calculateVendorRiskScore } from "../utils/vendorScorecard.utils";
import { withNormalizedIdentifiers } from "../utils/validations/vendorValidation.utils";
import { notifyUserAssigned } from "./inAppNotification.service";
import { triggerVendorOnboarding } from "./workflows/triggers";
import { notifyVendorRiskCandidates } from "./riskLinks/vendorCandidates";
import { enqueueVendorRiskLinkRecomputeBatch } from "./automations/automationProducer";
import { getActiveVendorRiskIdsQuery } from "../utils/vendorRiskLink.utils";
import { frontendBaseUrl } from "../utils/frontendUrl.utils";
import logger from "../utils/logger/fileLogger";

/**
 * A vendor's fields as the console sends them, checked by
 * assertVendorRequestBody; the model checks each value it stores.
 */
export interface VendorInput {
  vendor_name?: string;
  vendor_provides?: string;
  assignee?: number | null;
  website?: string;
  vendor_contact_person?: string;
  review_result?: string;
  review_status?: string;
  reviewer?: number | null;
  review_date?: string | Date;
  order_no?: number;
  is_demo?: boolean;
  projects?: number[];
  data_sensitivity?: string;
  business_criticality?: string;
  past_issues?: string;
  regulatory_exposure?: string;
  /**
   * The other names and the identifiers: only /api/v1 takes them, so the
   * legacy routes drop them first (withoutV1OnlyVendorFields).
   */
  other_names?: string | null;
  country?: string | null;
  registration_number?: string | null;
  lei?: string | null;
  sec_cik?: string | null;
}

/**
 * Who makes the change. The role decides which use cases they can link;
 * history is recorded only when the user is known.
 */
export interface VendorActor {
  userId?: number;
  role: string;
  organizationId: number;
}

type ScorecardField =
  "data_sensitivity" | "business_criticality" | "past_issues" | "regulatory_exposure";

/** "First Last" of the user making the change, for assignment notices. */
export async function actorDisplayName(userId: number | undefined): Promise<string> {
  if (!userId) return "Someone";
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  const name = result[0] ? `${result[0].name} ${result[0].surname}`.trim() : "";
  return name || "Someone";
}

/** Assignment notices for the vendor's assignee and reviewer. Never throws. */
async function notifyVendorAssignees(
  actor: VendorActor,
  vendor: IVendor,
  recipients: { assignee?: number | null; reviewer?: number | null },
): Promise<void> {
  if (!recipients.assignee && !recipients.reviewer) return;
  try {
    const assignerName = await actorDisplayName(actor.userId);
    const send = (userId: number, roleType: "Assignee" | "Reviewer") =>
      notifyUserAssigned(
        actor.organizationId,
        userId,
        {
          entityType: "vendor",
          entityId: vendor.id!,
          entityName: vendor.vendor_name,
          roleType,
          entityUrl: `/vendors?vendorId=${vendor.id}`,
        },
        assignerName,
        frontendBaseUrl(),
        { description: vendor.vendor_provides || undefined },
      ).catch((err) => logger.error(`Failed to send vendor ${roleType} notification:`, err));
    if (recipients.assignee) send(recipients.assignee, "Assignee");
    if (recipients.reviewer) send(recipients.reviewer, "Reviewer");
  } catch (error) {
    logger.error("Failed to send vendor assignment notifications:", error);
  }
}

/** Create a vendor; null when the insert returned nothing. */
export async function createVendor(
  input: VendorInput,
  actor: VendorActor,
): Promise<VendorModel | null> {
  // The model takes its own value types; it checks each one it stores.
  const fields = input as Record<string, any>;
  const transaction = await sequelize.transaction();
  let created: VendorModel;
  try {
    const vendorModel = await VendorModel.createNewVendor(
      fields.vendor_name,
      fields.vendor_provides,
      fields.assignee,
      fields.website,
      fields.vendor_contact_person,
      fields.review_result,
      fields.review_status,
      fields.reviewer,
      fields.review_date,
      fields.order_no,
      fields.is_demo || false,
      // Only use cases the user can see, as on update.
      Array.isArray(fields.projects)
        ? await visibleVendorProjectIds(
            fields.projects,
            { userId: actor.userId ?? 0, role: actor.role, transaction },
            actor.organizationId,
          )
        : [],
      fields.data_sensitivity,
      fields.business_criticality,
      fields.past_issues,
      fields.regulatory_exposure,
      // The score is computed on insert (createNewVendorQuery), never taken from the input.
      undefined,
      fields.other_names,
      {
        country: fields.country,
        registration_number: fields.registration_number,
        lei: fields.lei,
        sec_cik: fields.sec_cik,
      },
    );
    await vendorModel.validateVendorData();
    // Demo restrictions.
    vendorModel.canBeModified();

    const result = await createNewVendorQuery(vendorModel, actor.organizationId, transaction);
    if (!result) {
      await transaction.rollback();
      return null;
    }
    created = result;

    if (actor.userId) {
      await recordVendorCreation(
        created.id!,
        actor.userId,
        actor.organizationId,
        {
          // The identifiers in the form they are stored.
          ...withNormalizedIdentifiers(fields),
          risk_score: created.risk_score,
          // The links written (visible use cases only), none if empty.
          projects: created.projects?.length ? created.projects : undefined,
        },
        transaction,
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Fire-and-forget from here: none of it may fail the save.
  triggerVendorOnboarding(actor.organizationId, created.id!).catch((err) =>
    logger.error("Failed to trigger vendor_onboarding workflow:", err),
  );
  // A new vendor normally has no vendor risks yet, so this usually finds nothing.
  notifyVendorRiskCandidates({
    organizationId: actor.organizationId,
    vendorId: created.id!,
    vendorName: created.vendor_name,
    projectIds: created.projects ?? [],
  }).catch((err) => logger.error("Vendor risk candidate notice failed:", err));
  // Never the user who made the vendor, who assigned themselves.
  const notMe = (userId: number | null | undefined) =>
    userId && userId !== actor.userId ? userId : undefined;
  await notifyVendorAssignees(actor, created, {
    assignee: notMe(created.assignee),
    reviewer: notMe(created.reviewer),
  });

  return created;
}

/** Update a vendor; null when no vendor has this id in the organization. */
export async function updateVendor(
  vendorId: number,
  input: VendorInput,
  actor: VendorActor & { userId: number },
): Promise<IVendor | null> {
  const fields = input as Record<string, any>;
  const transaction = await sequelize.transaction();
  let existing: NonNullable<Awaited<ReturnType<typeof getVendorByIdQuery>>>;
  let vendor: NonNullable<Awaited<ReturnType<typeof updateVendorByIdQuery>>>;
  let projectIdsBefore: number[];
  let projectIdsAfter: number[];
  try {
    // Read and lock on the write's transaction: the before/after diffs below
    // (links, assignee, reviewer) must see the row this save overwrites.
    const found = await getVendorByIdQuery(vendorId, actor.organizationId, {
      transaction,
      forUpdate: true,
    });
    if (!found) {
      await transaction.rollback();
      return null;
    }
    existing = found;

    // The stored use case links are not carried over: links are written only
    // when the input has `projects`, so a field-only save never touches them.
    const vendorModel = new VendorModel({ ...existing, projects: undefined });

    // The risk score as it will be stored: computed from the answers this
    // save writes, else the stored ones (as updateVendorByIdQuery does).
    const answer = (field: ScorecardField) =>
      fields[field] !== undefined ? fields[field] : existing[field];
    // Name lookups are scoped to this organization and run on the write's
    // transaction. Use case links are diffed after the write, from storage.
    const historyContext = { organizationId: actor.organizationId, transaction };
    const changes = await trackEntityChanges(
      "vendor",
      vendorModel,
      {
        // The identifiers in the form they are stored.
        ...withNormalizedIdentifiers(fields),
        projects: undefined,
        risk_score: calculateVendorRiskScore({
          data_sensitivity: answer("data_sensitivity"),
          business_criticality: answer("business_criticality"),
          past_issues: answer("past_issues"),
          regulatory_exposure: answer("regulatory_exposure"),
        }),
      },
      historyContext,
    );

    // Checks each field the input has. The whole row is not validated again:
    // an imported vendor can have empty required fields, and a save that
    // doesn't touch them must not fail on them.
    await vendorModel.updateVendor({
      vendor_name: fields.vendor_name,
      vendor_provides: fields.vendor_provides,
      assignee: fields.assignee,
      website: fields.website,
      vendor_contact_person: fields.vendor_contact_person,
      review_result: fields.review_result,
      review_status: fields.review_status,
      reviewer: fields.reviewer,
      review_date: fields.review_date,
      order_no: fields.order_no,
      projects: fields.projects,
      data_sensitivity: fields.data_sensitivity,
      business_criticality: fields.business_criticality,
      past_issues: fields.past_issues,
      regulatory_exposure: fields.regulatory_exposure,
      other_names: fields.other_names,
      country: fields.country,
      registration_number: fields.registration_number,
      lei: fields.lei,
      sec_cik: fields.sec_cik,
    });

    const updated = await updateVendorByIdQuery(
      { id: vendorId, vendor: vendorModel, userId: actor.userId, role: actor.role, transaction },
      actor.organizationId,
    );
    if (!updated) {
      await transaction.rollback();
      return null;
    }
    vendor = updated;

    // The use case links as stored before and after: the input may name use
    // cases the user can't see, which are neither added nor removed. History
    // records the count only (changeHistory.config.ts).
    projectIdsBefore = (existing.projects ?? []).map(Number);
    projectIdsAfter = (vendor.projects ?? []).map(Number);
    changes.push(
      ...(await trackEntityChanges(
        "vendor",
        { projects: projectIdsBefore },
        { projects: projectIdsAfter },
        historyContext,
      )),
    );
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        vendorId,
        actor.userId,
        actor.organizationId,
        changes,
        transaction,
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Only use cases this update added or removed. A plain field edit sends no
  // projects, so both lists match and nothing fires.
  const addedProjectIds = projectIdsAfter.filter((id) => !projectIdsBefore.includes(id));
  const removedProjectIds = projectIdsBefore.filter((id) => !projectIdsAfter.includes(id));
  if (addedProjectIds.length > 0) {
    notifyVendorRiskCandidates({
      organizationId: actor.organizationId,
      vendorId,
      vendorName: vendor.vendor_name,
      projectIds: addedProjectIds,
    }).catch((err) => logger.error("Vendor risk candidate notice failed:", err));
  }
  // Use cases shared with another vendor feed the related vendor risk score,
  // so a change in either direction rescores this vendor's risks.
  if (addedProjectIds.length > 0 || removedProjectIds.length > 0) {
    getActiveVendorRiskIdsQuery(actor.organizationId, vendorId)
      .then((ids) =>
        enqueueVendorRiskLinkRecomputeBatch(actor.organizationId, ids, `vendor-${vendorId}`),
      )
      .catch((err) => logger.error("Vendor risk link recompute enqueue failed:", err));
  }

  // Newly assigned users only, never the user making the change.
  const isNew = (next: number | null | undefined, before: number | null | undefined) =>
    next && next !== before && next !== actor.userId ? next : undefined;
  await notifyVendorAssignees(actor, vendor, {
    assignee: isNew(vendor.assignee, existing.assignee),
    reviewer: isNew(vendor.reviewer, existing.reviewer),
  });

  return vendor;
}

/**
 * Delete a vendor with its risks and everything that points at it
 * (deleteVendorByIdQuery). False when no vendor has this id in the
 * organization. A deletion with no known user is recorded as the system's.
 */
export async function deleteVendor(vendorId: number, actor: VendorActor): Promise<boolean> {
  const transaction = await sequelize.transaction();
  try {
    const deleted = await deleteVendorByIdQuery(
      vendorId,
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
