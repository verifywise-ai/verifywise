/**
 * Shape the approval workflow field of a use case form before it is sent.
 *
 * The select uses 0 for "not selected", which must never reach the backend
 * as a foreign key. On create the field is left out. On edit it is sent as
 * null instead: the update leaves an omitted column as it is, so leaving it
 * out would keep the saved workflow and "none" could never clear it.
 */
export function applyApprovalWorkflowSelection(
  body: { approval_workflow_id?: unknown },
  { isEdit }: { isEdit: boolean },
): void {
  if (body.approval_workflow_id !== 0) return;
  if (isEdit) {
    body.approval_workflow_id = null;
  } else {
    delete body.approval_workflow_id;
  }
}
