/**
 * Deciding a finding of the vendor research agent: accepting it into the vendor risk register or
 * dismissing it. Nothing is written to the register until a finding is accepted.
 *
 * Accepting is one transaction: the finding is locked, the risk is created the way the vendor risk
 * form creates it, and the finding is marked accepted. Only after the commit do the effects that
 * follow a new risk run (the related-risk recompute, the candidate notice, the action owner's
 * notice), so a rolled-back accept announces nothing.
 *
 * The person accepting can change the finding on the way: the vendor risk form opens on it, and
 * saving sends what is on screen with the accept (see FindingEdits). The risk is then created from
 * those values and the finding is marked accepted in the same transaction, so a risk the person
 * edited is never created without its finding being settled, nor the finding settled without the
 * risk. The vendor is always the finding's own.
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
import { IVendorRisk } from "../../domain.layer/interfaces/i.vendorRisk";
import {
  DISMISS_REASONS,
  DismissReason,
  IVendorRiskFinding,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { VendorRiskModel } from "../../domain.layer/models/vendorRisk/vendorRisk.model";
import logger from "../../utils/logger/fileLogger";
import { VENDOR_RISK_ENUMS } from "../../utils/validations/validation.utils";
import {
  VENDOR_RISK_VALIDATION_LIMITS,
  calculateRiskLevel,
} from "../../utils/validations/vendorRiskValidation.utils";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  getFindingByIdQuery,
  markFindingAcceptedQuery,
  markFindingDismissedQuery,
} from "../../utils/vendorResearch.utils";
import {
  CreateVendorRiskInput,
  createVendorRiskInTransaction,
  runVendorRiskPostCommitEffects,
} from "../vendors/vendorRiskCreate.service";
import { isUserOfOrganization } from "./assignee";
import { researchMetrics } from "./metrics";
import { cleanText } from "./text";

/**
 * The longest dismissal note, in characters. The column is TEXT and has no limit of its own, so
 * this is ours; characters are counted the way Postgres counts them (code points).
 */
const NOTE_MAX_CHARS = 500;

/** The most frameworks one accept can link the new risk to. */
const MAX_FRAMEWORKS = 100;

/**
 * Whether `text` has at most `max` characters, counted the way Postgres counts them (code points).
 * A character takes at most two UTF-16 units, so more than twice the limit in units is surely more
 * than the limit in characters. That is settled by the length alone, before the characters are
 * listed to count them: a text can be megabytes long.
 */
const fitsWithin = (text: string, max: number): boolean =>
  text.length <= 2 * max && Array.from(text).length <= max;

/**
 * What the person accepting a finding changed in it before saving, as it came off the wire: none of
 * it has been checked. A field that is absent keeps the value of the finding. The texts and the
 * level are bounded like the vendor risk form bounds them (VENDOR_RISK_VALIDATION_LIMITS); the
 * likelihood and the severity are the register's own values.
 *
 * The risk level is stored as it is sent, as the vendor risk form's own save does, because the form
 * shows the level it works out and saves that one. When it is absent and the likelihood or the
 * severity changed, it is worked out from the pair the way the research does it.
 */
export interface FindingEdits {
  risk_description?: unknown;
  impact_description?: unknown;
  action_plan?: unknown;
  likelihood?: unknown;
  risk_severity?: unknown;
  risk_level?: unknown;
  frameworks?: unknown;
}

/** The edits after the checks: only the fields that were sent, cleaned. */
interface CheckedEdits {
  risk_description?: string;
  impact_description?: string;
  action_plan?: string;
  likelihood?: IVendorRisk["likelihood"];
  risk_severity?: IVendorRisk["risk_severity"];
  risk_level?: string;
  frameworks?: number[];
}

/**
 * A text of the register as it is stored, or null when it is not one: it has to be a string with
 * something in it once the control characters are out (Postgres refuses a NUL in text), lone
 * surrogates replaced and the ends trimmed, and at most `max` characters long after that.
 */
function registerText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value).trim();
  return cleaned === "" || !fitsWithin(cleaned, max) ? null : cleaned;
}

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/**
 * The edits as the register can take them, or a ValidationException for the first one that it
 * cannot. This runs before anything is locked, read or written, so a bad edit costs nothing.
 *
 * The numbers in the messages repeat the limits of VENDOR_RISK_VALIDATION_LIMITS: a message has to
 * stay a literal for the extractor of the locale files. The refused value is not kept on the
 * exception, because a text can be megabytes long and exceptions are logged.
 */
function checkEdits(edits: FindingEdits): CheckedEdits {
  const checked: CheckedEdits = {};
  const limits = VENDOR_RISK_VALIDATION_LIMITS;

  if (edits.risk_description !== undefined) {
    const text = registerText(edits.risk_description, limits.RISK_DESCRIPTION.MAX);
    if (text === null) {
      throw new ValidationException(
        "The risk description must be 1 to 500 characters",
        "risk_description",
      );
    }
    checked.risk_description = text;
  }

  if (edits.impact_description !== undefined) {
    const text = registerText(edits.impact_description, limits.IMPACT_DESCRIPTION.MAX);
    if (text === null) {
      throw new ValidationException(
        "The impact description must be 1 to 500 characters",
        "impact_description",
      );
    }
    checked.impact_description = text;
  }

  if (edits.action_plan !== undefined) {
    const text = registerText(edits.action_plan, limits.ACTION_PLAN.MAX);
    if (text === null) {
      throw new ValidationException("The action plan must be 1 to 1000 characters", "action_plan");
    }
    checked.action_plan = text;
  }

  if (edits.likelihood !== undefined) {
    if (!isOneOf(VENDOR_RISK_ENUMS.LIKELIHOOD, edits.likelihood)) {
      throw new ValidationException("Invalid likelihood", "likelihood");
    }
    checked.likelihood = edits.likelihood;
  }

  if (edits.risk_severity !== undefined) {
    if (!isOneOf(VENDOR_RISK_ENUMS.RISK_SEVERITY, edits.risk_severity)) {
      throw new ValidationException("Invalid risk severity", "risk_severity");
    }
    checked.risk_severity = edits.risk_severity;
  }

  if (edits.risk_level !== undefined) {
    const text = registerText(edits.risk_level, limits.RISK_LEVEL.MAX);
    if (text === null) {
      throw new ValidationException("Invalid risk level", "risk_level");
    }
    checked.risk_level = text;
  }

  if (edits.frameworks !== undefined) {
    const ids = edits.frameworks;
    const valid =
      Array.isArray(ids) &&
      ids.length <= MAX_FRAMEWORKS &&
      ids.every((id) => Number.isSafeInteger(id) && id > 0);
    if (!valid) {
      throw new ValidationException("Invalid frameworks", "frameworks");
    }
    checked.frameworks = Array.from(new Set(ids as number[]));
  }

  return checked;
}

/**
 * The level of the new risk when the caller sent none: the finding's own while the likelihood and
 * the severity are the finding's, else worked out from the pair the way the research stores it.
 */
function levelOfPair(
  finding: IVendorRiskFinding,
  likelihood: IVendorRisk["likelihood"],
  severity: IVendorRisk["risk_severity"],
): string {
  if (likelihood === finding.likelihood && severity === finding.risk_severity) {
    return finding.risk_level;
  }
  const level = calculateRiskLevel(severity, likelihood);
  return level === null ? finding.risk_level : `${level} Risk`;
}

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
 * @param args.edits What the person changed in the finding before saving (see FindingEdits).
 *   Absent: the risk is the finding as it is.
 * @throws NotFoundException when the organization has no such finding or its vendor is gone
 * @throws ConflictException when the finding is no longer pending, or another accept or the
 *   status job holds it at this moment (try again)
 * @throws ValidationException when an edit is not valid, or the action owner is not a user of the
 *   organization
 * @throws DatabaseException when the register or the finding could not be written
 */
export async function acceptFinding(args: {
  organizationId: number;
  findingId: number;
  userId: number;
  actionOwner?: number | null;
  edits?: FindingEdits;
}): Promise<{ finding: IVendorRiskFinding; vendorRisk: VendorRiskModel }> {
  const { organizationId, findingId, userId, actionOwner } = args;
  const edits = checkEdits(args.edits ?? {});

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
      // Another accept, or the status job relabelling the finding, holds it at this moment: the
      // finding may still be pending, so the answer asks to try again rather than saying it was
      // decided.
      throw new ConflictException(
        "This finding is being updated. Try again in a moment.",
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

    const likelihood = edits.likelihood ?? finding.likelihood;
    const riskSeverity = edits.risk_severity ?? finding.risk_severity;
    const riskInput: CreateVendorRiskInput = {
      vendor_id: finding.vendor_id,
      risk_description: edits.risk_description ?? finding.risk_description,
      impact_description: edits.impact_description ?? finding.impact_description,
      likelihood,
      risk_severity: riskSeverity,
      action_plan: edits.action_plan ?? finding.action_plan,
      action_owner: ownerId,
      risk_level: edits.risk_level ?? levelOfPair(finding, likelihood, riskSeverity),
    };
    // A finding carries no frameworks; the person accepting it can pick some. A failed framework
    // insert aborts the whole transaction (see createVendorRiskInTransaction), so the accept fails
    // as a whole and the finding stays pending. None are passed when none were picked.
    if (edits.frameworks !== undefined && edits.frameworks.length > 0) {
      riskInput.frameworks = edits.frameworks;
    }
    const vendorRisk = await createVendorRiskInTransaction(
      riskInput,
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
  researchMetrics().findingDecided({
    decision: "accepted",
    category: accepted.finding.category,
  });
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

  // The 500 in the message repeats NOTE_MAX_CHARS: the message has to stay a literal for the
  // extractor of the locale files.
  if (!fitsWithin(cleaned, NOTE_MAX_CHARS)) {
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
  if (dismissed) {
    researchMetrics().findingDecided({
      decision: "dismissed",
      category: dismissed.category,
      reason,
    });
    return dismissed;
  }

  if (!(await getFindingByIdQuery(organizationId, findingId))) {
    throw new NotFoundException("Finding not found", "VendorRiskFinding", findingId);
  }
  throw new ConflictException(
    "This finding has already been accepted or dismissed",
    "VendorRiskFinding",
    "status",
  );
}
