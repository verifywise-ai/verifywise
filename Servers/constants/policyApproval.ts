/**
 * Why a policy approval request cannot be created through the generic
 * approval-request paths (POST /approval-requests, the advisor tool): only
 * submit for approval opens one, after checking the policy's status, the
 * usable workflow and that nothing is pending.
 */
export const POLICY_REQUEST_ELSEWHERE_MESSAGE = "Submit the policy for approval from the policy";
