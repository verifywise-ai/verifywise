/**
 * Warnings returned when a share link is created or updated, so whoever makes
 * the link through the API knows what its holder will see. Policy links can
 * only be made through the API (the app offers share links for models only),
 * so the response is the one place to say it.
 *
 * Each warning is an English message key, translated by the caller with req.t.
 */

/** A policy list link (resource_id 0) shows policies of every status. */
export const POLICY_LIST_SHARE_WARNING =
  "This link lists up to 100 of your organization's most recent policies, drafts and archived policies included.";

/** With share all fields on, a policy link shows full policy text and every stored field. */
export const POLICY_ALL_FIELDS_SHARE_WARNING =
  "Share all fields is on: anyone with this link can read the full text and every stored field of the policies it shows.";

export const shareLinkWarnings = (
  resourceType: string,
  resourceId: number,
  settings: { shareAllFields?: unknown } | null | undefined,
): string[] => {
  if (resourceType !== "policy") return [];
  const warnings: string[] = [];
  if (Number(resourceId) === 0) warnings.push(POLICY_LIST_SHARE_WARNING);
  if (settings?.shareAllFields === true) warnings.push(POLICY_ALL_FIELDS_SHARE_WARNING);
  return warnings;
};
