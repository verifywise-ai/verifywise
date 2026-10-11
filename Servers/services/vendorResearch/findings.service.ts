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
import logger from "../../utils/logger/fileLogger";
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
import { isUserOfOrganization } from "./assignee";
import { cleanText } from "./text";

/**
 * The longest dismissal note, in characters. The column is TEXT and has no limit of its own, so
 * this is ours; characters are counted the way Postgres counts them (code points).
 */
const NOTE_MAX_CHARS = 500;

/** Postgres error 55P03 (lock_not_available): what `FOR UPDATE NOWAIT` raises for a row that is held. */
const LOCK_NOT_AVAILABLE = "55P03";

/** Whether `error` is the refusal of a lock that is held, the way Sequelize reports a database error. */
const isLockNotAvailable = (error: unknown): boolean => {
  const { parent, original } = (error ?? {}) as {
    parent?: { code?: string };
    original?: { code?: string };
  };
  return parent?.code === LOCK_NOT_AVAILABLE || original?.code === LOCK_NOT_AVAILABLE;
};

/**
 * Who owns the action of the new risk: the user the caller names, who must belong to the
 * organization; nobody when the caller says `null`; and when the caller says nothing, the vendor's
 * assignee, if that user belongs to the organization too.
 *
 * Nothing in the database ties a vendor's assignee to the vendor's organization, and an action
 * owner of another organization would be sent a notice with the risk's text and the vendor's name.
 * An assignee who is not a user of the organization is therefore not taken: the risk gets no owner
 * and the accept goes on, because the caller did not choose that owner and has nothing to correct.
 */
async function resolveActionOwner(
  requested: number | null | undefined,
  vendor: IVendor,
  organizationId: number,
  transaction: Transaction,
): Promise<number | null> {
  if (requested === null) return null;

  if (requested === undefined) {
    const assignee = vendor.assignee ?? null;
    if (assignee === null) return null;
    if (await isUserOfOrganization(assignee, organizationId, transaction)) return assignee;

    // Ids only: the log must not carry a name or the text of a finding.
    logger.warn(
      `accepting a finding of vendor ${vendor.id} (org ${organizationId}): the assignee, user ${assignee}, ` +
        "is not a user of the organization, so the risk has no action owner",
    );
    return null;
  }

  if (!(await isUserOfOrganization(requested, organizationId, transaction))) {
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
 * The finding is locked FOR UPDATE NOWAIT and its status is checked after the lock, so of two
 * accepts that arrive together one creates the risk and the other is refused with a conflict: it
 * finds the finding accepted, or the first still holds the lock and the lock is refused at once.
 * It does not queue for the lock. A transaction takes its pooled connection when it begins, and
 * the one that holds the lock still needs more connections (the vendor lookup and the change
 * history run outside its transaction), so accepts that waited could use up the pool between them.
 * Anything that goes wrong rolls the whole accept back and leaves the finding pending.
 *
 * @param args.actionOwner Absent: the vendor's assignee, when that user belongs to the
 *   organization, else no owner. `null`: no owner. A number: that user, who must belong to the
 *   organization.
 * @throws NotFoundException when the organization has no such finding or its vendor is gone
 * @throws ConflictException when the finding is no longer pending, or another decision holds it
 *   at this moment
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
    let finding: IVendorRiskFinding | null;
    try {
      finding = await getFindingByIdQuery(organizationId, findingId, {
        transaction,
        forUpdate: true,
        noWait: true,
      });
    } catch (error) {
      if (!isLockNotAvailable(error)) throw error;
      // Another decision is being made on the finding at this moment: for this accept it is a
      // finding that is decided, and the same answer.
      throw new ConflictException(
        "This finding has already been accepted or dismissed",
        "VendorRiskFinding",
        "status",
      );
    }
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

  // A character takes at most two UTF-16 units, so more than twice the limit in units is surely
  // more than the limit in characters. That is settled by the length alone, before the characters
  // are listed to count them: a note can be megabytes long.
  // The 500 in the message repeats NOTE_MAX_CHARS: the message has to stay a literal for the
  // extractor of the locale files.
  const tooLong =
    cleaned.length > 2 * NOTE_MAX_CHARS || Array.from(cleaned).length > NOTE_MAX_CHARS;
  if (tooLong) {
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
