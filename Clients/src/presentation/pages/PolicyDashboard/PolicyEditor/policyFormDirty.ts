import { PolicyFormData } from "../../../types/interfaces/i.policy";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";
import { toDateOnlyString } from "../../../tools/isoDateToString";

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * True when the editor holds changes the saved policy does not have.
 *
 * Metadata is compared with the saved policy the way the editor seeds it
 * (status falls back to Draft, an owner or reviewers the user list does not
 * know are dropped). Content is compared with `savedContent`, the HTML last loaded or
 * saved, because the editor keeps `policy.content_html` at its first value
 * after a save so TipTap is not rebuilt.
 */
export function isPolicyFormDirty({
  policy,
  formData,
  knownUserIds,
  savedContent,
}: {
  policy: PolicyManagerModel;
  formData: PolicyFormData;
  knownUserIds: ReadonlySet<number>;
  savedContent: string;
}): boolean {
  if (formData.title !== (policy.title || "")) return true;
  if (formData.status !== (policy.status || "Draft")) return true;
  if (!sameStrings(formData.tags, policy.tags || [])) return true;
  if ((formData.nextReviewDate || "") !== toDateOnlyString(policy.next_review_date)) return true;
  if ((formData.policyOwner?.id ?? null) !== shownOwnerId(policy, knownUserIds)) return true;
  const savedReviewers = (policy.assigned_reviewer_ids || []).filter((id) => knownUserIds.has(id));
  if (
    !sameIds(
      formData.assignedReviewers.map((u) => u.id),
      savedReviewers,
    )
  ) {
    return true;
  }
  return formData.content !== savedContent;
}

/**
 * The saved owner as the editor shows it: null when the user list does not
 * know the owner (for example a user who has left the organization), because
 * the owner field cannot display them.
 */
function shownOwnerId(
  policy: PolicyManagerModel,
  knownUserIds: ReadonlySet<number>,
): number | null {
  const ownerId = policy.policy_owner_id ?? null;
  return ownerId != null && knownUserIds.has(ownerId) ? ownerId : null;
}

/**
 * The `policy_owner_id` to send on save. An empty owner field on a saved
 * policy whose owner the user list does not know means "unchanged", not
 * "cleared": the field never showed that owner, so it is left out of the
 * payload (undefined) and the server keeps it.
 */
export function policyOwnerIdToSave({
  policy,
  formOwnerId,
  knownUserIds,
}: {
  policy: PolicyManagerModel | null;
  formOwnerId: number | null;
  knownUserIds: ReadonlySet<number>;
}): number | null | undefined {
  if (formOwnerId != null) return formOwnerId;
  const savedOwnerId = policy?.policy_owner_id ?? null;
  if (savedOwnerId != null && !knownUserIds.has(savedOwnerId)) return undefined;
  return null;
}

function sameStrings(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}
