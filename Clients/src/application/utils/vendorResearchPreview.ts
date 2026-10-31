import type { AcceptFindingBody } from "../../domain/interfaces/i.vendorResearch";
import type { VendorRiskFormDetails } from "../../domain/interfaces/i.vendor";

/** A positive whole number a float holds exactly: what an id is. */
const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * The user the owner list of the preview starts on, so that the form can be saved as it opens:
 * the vendor's assignee when that user belongs to the organization, else the person adding the
 * risk. Nothing ties the assignee of a vendor to the organization's users, so one that is not on
 * the list is not offered. Null, and the person has to choose, only when nobody is signed in.
 */
export function defaultActionOwner(
  assignee: number | null | undefined,
  users: ReadonlyArray<{ id: number }>,
  currentUserId: number | null,
): number | null {
  if (isId(assignee) && users.some((user) => user.id === assignee)) return assignee;
  return currentUserId;
}

/**
 * The accept request for what the vendor risk form saved from a preview. The vendor is left out:
 * it is the finding's own. The owner goes as a number, as the server takes it; one the form could
 * not name is left out, and then the server's default applies (the vendor's assignee).
 */
export function toAcceptBody(details: VendorRiskFormDetails): AcceptFindingBody {
  const owner = Number(details.action_owner);
  return {
    ...(isId(owner) ? { action_owner: owner } : {}),
    risk_description: details.risk_description,
    impact_description: details.impact_description,
    action_plan: details.action_plan,
    likelihood: details.likelihood,
    risk_severity: details.risk_severity,
    risk_level: details.risk_level,
    frameworks: details.frameworks,
  };
}
