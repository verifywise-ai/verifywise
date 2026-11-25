import { NotificationEntityType } from "../domain.layer/interfaces/i.notification";

/**
 * The app route that opens one approval request: the approvals modal on the
 * approval workflows page, in whichever tab lists it (to approve, or the
 * user's own submissions). There is no `/approval-requests/:id` page.
 */
export const approvalRequestPath = (requestId: number): string =>
  `/approval-workflows?request=${requestId}`;

/**
 * The item an approval request is about, when the app has a page for it: a
 * use case or a policy. Other entities return null; their notices link to
 * the request instead.
 */
export const approvalLinkedEntity = (
  entityType: string | null | undefined,
  entityId: number | null | undefined,
): { type: NotificationEntityType; id: number } | null => {
  if (!entityId) return null;
  if (entityType === "policy") return { type: NotificationEntityType.POLICY, id: entityId };
  if (entityType === "use_case") return { type: NotificationEntityType.USE_CASE, id: entityId };
  return null;
};
