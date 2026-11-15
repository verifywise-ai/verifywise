import { PolicyFormData } from "../../../types/interfaces/i.policy";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";
import { toDateOnlyString } from "../../../tools/isoDateToString";

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * True when the editor holds changes the saved policy does not have.
 *
 * Metadata is compared with the saved policy the way the editor seeds it
 * (status falls back to Draft, reviewers the user list does not know are
 * dropped). Content is compared with `savedContent`, the HTML last loaded or
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
  if ((formData.policyOwner?.id ?? null) !== (policy.policy_owner_id ?? null)) return true;
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

function sameStrings(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}
