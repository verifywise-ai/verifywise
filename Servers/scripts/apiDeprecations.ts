/**
 * API deprecation list (ADR 0001 §7, docs/technical/adr/0001-api-versioning.md).
 *
 * scripts/generateSwagger.ts reads this list. For every entry it sets
 * `deprecated: true` on the operation and prepends the Sunset notice to the
 * operation description, before the generator's `Requires role: ...` suffix.
 * swagger.yaml is generated: never mark a deprecation by hand there.
 *
 * Deprecating an endpoint does not change its behaviour. Removal happens in a
 * dedicated PR, no earlier than one minor release after the release that
 * deprecates it, with parity coverage for the replacement.
 */

export type DeprecatedMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ApiDeprecation {
  method: DeprecatedMethod;
  /** OpenAPI path as it appears in swagger.yaml, e.g. "/policies/{id}/review/request". */
  path: string;
  /** Earliest release that may remove the endpoint. */
  sunset: string;
  /** What callers should use instead. */
  replacement: string;
}

/**
 * Marker the generator recognises. It strips any notice that starts with it
 * before re-applying the list, so regeneration never grows the description.
 */
export const DEPRECATION_NOTICE_PREFIX = "**Deprecated.**";

const POLICY_REVIEW_SUNSET = "not before v2.7.0";
const POLICY_APPROVAL_REPLACEMENT =
  "Submit with POST /v1/policies/{id}/submit-for-approval and decide through the approval requests endpoints (/approval-requests), or, when the organization has no policy approval workflow, an Admin approves with POST /v1/policies/{id}/approve.";

export const API_DEPRECATIONS: ApiDeprecation[] = [
  {
    method: "post",
    path: "/policies/{id}/review/request",
    sunset: POLICY_REVIEW_SUNSET,
    replacement: POLICY_APPROVAL_REPLACEMENT,
  },
  {
    method: "put",
    path: "/policies/{id}/review/approve",
    sunset: POLICY_REVIEW_SUNSET,
    replacement: POLICY_APPROVAL_REPLACEMENT,
  },
  {
    method: "put",
    path: "/policies/{id}/review/reject",
    sunset: POLICY_REVIEW_SUNSET,
    replacement: POLICY_APPROVAL_REPLACEMENT,
  },
];

/** The one-line notice prepended to a deprecated operation's description. */
export function deprecationNotice(entry: ApiDeprecation): string {
  return `${DEPRECATION_NOTICE_PREFIX} Sunset: ${entry.sunset}. ${entry.replacement}`;
}
