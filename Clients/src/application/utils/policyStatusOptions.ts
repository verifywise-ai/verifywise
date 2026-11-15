/**
 * Which policy statuses a person may pick by hand.
 *
 * Mirrors the server's status gate so the dropdown never offers a value the
 * save would reject. Keep this in step with:
 *   - Servers/utils/policyStatus.utils.ts (`getPolicyStatusChangeError`, rules C and 1–6)
 *   - Servers/utils/validations/policiesValidation.utils.ts (`POLICY_INVALID_STATUS_TRANSITIONS`)
 * The client cannot import server code, so the table is copied here and
 * policyStatusOptions.test.ts encodes the same rules.
 */

export const POLICY_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Published",
  "Archived",
  "Deprecated",
] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

/** Statuses a new policy may be created with (server: POLICY_CREATE_STATUSES). */
export const POLICY_CREATE_STATUSES: readonly PolicyStatus[] = ["Draft", "Archived", "Deprecated"];

/**
 * Statuses a policy can be submitted for approval or approved directly from
 * (server: SUBMITTABLE_STATUSES in services/policies/policyApproval.service.ts).
 * Any other status reaches Approved only through these.
 */
export const POLICY_APPROVABLE_STATUSES: readonly PolicyStatus[] = ["Draft", "Under Review"];

/** Server: POLICY_INVALID_STATUS_TRANSITIONS (messages omitted). */
export const POLICY_INVALID_STATUS_TRANSITIONS: ReadonlyArray<{
  from: PolicyStatus;
  to: PolicyStatus;
}> = [
  { from: "Published", to: "Draft" },
  { from: "Published", to: "Under Review" },
  { from: "Archived", to: "Draft" },
  { from: "Archived", to: "Under Review" },
  { from: "Archived", to: "Approved" },
  { from: "Deprecated", to: "Published" },
];

/**
 * True when the server would accept moving a policy from `currentStatus` to
 * `nextStatus` by hand. `currentStatus === null` means a new policy.
 * The rule order matches the server's; the first match wins.
 */
export function isPolicyStatusChangeAllowed(
  currentStatus: string | null,
  nextStatus: string,
  hasPendingRequest = false,
): boolean {
  // C: create
  if (currentStatus === null) {
    return (POLICY_CREATE_STATUSES as readonly string[]).includes(nextStatus);
  }
  // 1: not a change
  if (nextStatus === currentStatus) return true;
  // 2: a pending approval request freezes the status
  if (hasPendingRequest) return false;
  // 3, 4: set only through approval
  if (nextStatus === "Under Review" || nextStatus === "Approved") return false;
  // 5: publish only an approved policy
  if (nextStatus === "Published" && currentStatus !== "Approved") return false;
  // 6: transition table
  return !POLICY_INVALID_STATUS_TRANSITIONS.some(
    (t) => t.from === currentStatus && t.to === nextStatus,
  );
}

/**
 * Statuses to offer in the status dropdown, in the usual order. The current
 * value is always included, even a legacy value outside the enum.
 */
export function getSelectablePolicyStatuses(
  currentStatus: string | null,
  hasPendingRequest = false,
): string[] {
  const options: string[] = POLICY_STATUSES.filter((s) =>
    isPolicyStatusChangeAllowed(currentStatus, s, hasPendingRequest),
  );
  if (currentStatus !== null && !options.includes(currentStatus)) {
    options.unshift(currentStatus);
  }
  return options;
}
