/**
 * Deciding a finding of the vendor research agent: accepting it into the vendor risk register or
 * dismissing it. Nothing is written to the register until a finding is accepted.
 *
 * Accepting is one transaction: the finding is locked, the risk is created the way the vendor risk
 * form creates it, and the finding is marked accepted. Only after the commit do the effects that
 * follow a new risk run (the related-risk recompute, the candidate notice, the action owner's
 * notice), so a rolled-back accept announces nothing.
 *
 * Every finding is looked up by organization and id. A finding of another organization is the
 * same as a finding that does not exist, and a vendor of another organization is the same as a
 * vendor that does not exist: the vendor_id of a finding is not tied to its organization in the
 * database, so this service does not rely on its callers for it.
 *
 * The messages of the exceptions are shown to the caller, translated by the controller, so each
 * one is written out at its throw and has an entry in locales/{en,de,fr}.json.
 */
import { Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  DatabaseException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import {
  DISMISS_REASONS,
  DismissReason,
  IVendorRiskFinding,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { VendorRiskModel } from "../../domain.layer/models/vendorRisk/vendorRisk.model";
import { findUsersNotInOrganization } from "../../utils/user.utils";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  getFindingByIdQuery,
  markFindingAcceptedQuery,
  markFindingDismissedQuery,
} from "../../utils/vendorResearch.utils";
import {
  createVendorRiskInTransaction,
  runVendorRiskPostCommitEffects,
} from "../vendors/vendorRiskCreate.service";
import { cleanText } from "./text";

/**
 * The longest dismissal note, in characters. The column is TEXT and has no limit of its own, so
 * this is ours; characters are counted the way Postgres counts them (code points).
 */
const NOTE_MAX_CHARS = 500;

/**
 * Who owns the action of the new risk: the vendor's assignee when the caller says nothing, nobody
 * when the caller says `null`, and the user the caller names, who must belong to the organization.
 */
async function resolveActionOwner(
  requested: number | null | undefined,
  vendor: IVendor,
  organizationId: number,
  transaction: Transaction,
): Promise<number | null> {
  if (requested === undefined) return vendor.assignee ?? null;
  if (requested === null) return null;

  // The lookup ignores ids that are not positive whole numbers and so reports nothing missing for
  // them: an empty answer is only a yes for an id that was valid to begin with.
  const isUserOfOrganization =
    Number.isSafeInteger(requested) &&
    requested > 0 &&
    (await findUsersNotInOrganization([requested], organizationId, transaction)).length === 0;
  if (!isUserOfOrganization) {
    throw new ValidationException(
      "The action owner must be a user of your organization",
      "action_owner",
      requested,
    );
  }
  return requested;
}

/**
 * Accepts a pending finding: creates the vendor risk it describes, marks the finding accepted into
 * it and, once that has committed, runs the effects of a new vendor risk.
 *
 * The finding is locked FOR UPDATE and its status is checked after the lock, so of two accepts
 * that arrive together one creates the risk and the other finds the finding accepted and is
 * refused with a conflict. Anything that goes wrong rolls the whole accept back and leaves the
 * finding pending.
 *
 * @param args.actionOwner Absent: the vendor's assignee. `null`: no owner. A number: that user,
 *   who must belong to the organization.
 * @throws NotFoundException when the organization has no such finding or its vendor is gone
 * @throws ConflictException when the finding is no longer pending
 * @throws ValidationException when the action owner is not a user of the organization
 * @throws DatabaseException when the register or the finding could not be written
 */
export async function acceptFinding(args: {
  organizationId: number;
  findingId: number;
  userId: number;
  actionOwner?: number | null;
}): Promise<{ finding: IVendorRiskFinding; vendorRisk: VendorRiskModel }> {
  const { organizationId, findingId, userId, actionOwner } = args;

  const accepted = await sequelize.transaction(async (transaction) => {
    const finding = await getFindingByIdQuery(organizationId, findingId, {
      transaction,
      forUpdate: true,
    });
    if (!finding) {
      throw new NotFoundException("Finding not found", "VendorRiskFinding", findingId);
    }
    if (finding.status !== "pending") {
      throw new ConflictException(
        "This finding has already been accepted or dismissed",
        "VendorRiskFinding",
        "status",
      );
    }

    const vendor = await getVendorByIdQuery(finding.vendor_id, organizationId);
    if (!vendor) {
      throw new NotFoundException("Vendor not found", "Vendor", finding.vendor_id);
    }

    const ownerId = await resolveActionOwner(actionOwner, vendor, organizationId, transaction);

    // A finding carries no frameworks, and none are passed: a failed framework insert would abort
    // the whole transaction.
    const vendorRisk = await createVendorRiskInTransaction(
      {
        vendor_id: finding.vendor_id,
        risk_description: finding.risk_description,
        impact_description: finding.impact_description,
        likelihood: finding.likelihood,
        risk_severity: finding.risk_severity,
        action_plan: finding.action_plan,
        action_owner: ownerId,
        risk_level: finding.risk_level,
      },
      userId,
      organizationId,
      transaction,
    );
    // A risk that was not stored is a failure, not an accept without a risk.
    if (!vendorRisk || !vendorRisk.id) {
      throw new DatabaseException(
        "The risk could not be added to the vendor risk register",
        "insert",
        "vendorrisks",
      );
    }

    const decided = await markFindingAcceptedQuery(
      { organizationId, id: finding.id, vendorRiskId: vendorRisk.id, userId },
      transaction,
    );
    // Under the lock the finding is still pending, so this cannot happen. Committing the risk
    // anyway would leave it in the register with its finding pending, and the next accept would
    // create it a second time.
    if (!decided) {
      throw new DatabaseException(
        "The risk could not be added to the vendor risk register",
        "update",
        "vendor_risk_findings",
      );
    }

    return { finding: decided, vendorRisk };
  });

  // The transaction has committed: the effects see the risk, and a failed accept never gets here.
  await runVendorRiskPostCommitEffects(accepted.vendorRisk, userId, organizationId);
  return accepted;
}

/**
 * The note as it is stored, or null when nothing is left of it: control characters out (Postgres
 * refuses a NUL in text), lone surrogates replaced, trimmed, and only then counted.
 */
function prepareNote(note: string | undefined): string | null {
  if (note === undefined) return null;

  const cleaned = cleanText(note).trim();
  if (cleaned === "") return null;
  if (Array.from(cleaned).length > NOTE_MAX_CHARS) {
    throw new ValidationException("The note can be at most 500 characters", "note");
  }
  return cleaned;
}

/**
 * Dismisses a pending finding with a reason and an optional note.
 *
 * One conditional update decides it, so a finding is dismissed once and never after it was
 * accepted. When the update finds nothing to decide, a second read tells a finding that is gone
 * from one that was decided already.
 *
 * @throws ValidationException when the reason is not one of DISMISS_REASONS or the note is longer
 *   than 500 characters
 * @throws NotFoundException when the organization has no such finding
 * @throws ConflictException when the finding is no longer pending
 */
export async function dismissFinding(args: {
  organizationId: number;
  findingId: number;
  userId: number;
  reason: DismissReason;
  note?: string;
}): Promise<IVendorRiskFinding> {
  const { organizationId, findingId, userId, reason } = args;

  if (!(DISMISS_REASONS as readonly unknown[]).includes(reason)) {
    throw new ValidationException("Invalid dismissal reason", "reason", reason);
  }
  const note = prepareNote(args.note);

  const dismissed = await markFindingDismissedQuery({
    organizationId,
    id: findingId,
    reason,
    note,
    userId,
  });
  if (dismissed) return dismissed;

  if (!(await getFindingByIdQuery(organizationId, findingId))) {
    throw new NotFoundException("Finding not found", "VendorRiskFinding", findingId);
  }
  throw new ConflictException(
    "This finding has already been accepted or dismissed",
    "VendorRiskFinding",
    "status",
  );
}
