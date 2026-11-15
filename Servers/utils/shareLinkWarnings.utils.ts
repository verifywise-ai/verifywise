/**
 * What a share link exposes, reported when it is created, updated or listed so
 * whoever makes it through the API knows what its holder will see. Policy
 * links can only be made through the API (the app offers share links for
 * models only), so the response is the one place to say it.
 *
 * The controller turns each code into a translated message.
 */

export type ShareLinkWarning = "policyList" | "policyAllFields" | "policyExport";

/** A link with resource_id 0 shows the resource's list (table view); any other id one record. */
export const isTableViewLink = (resourceId: number | string): boolean => Number(resourceId) === 0;

export const shareLinkWarnings = (link: {
  resource_type: string;
  resource_id: number | string;
  settings?: { shareAllFields?: unknown; allowDataExport?: unknown } | null;
  is_enabled?: boolean;
  expires_at?: Date | string | null;
}): ShareLinkWarning[] => {
  if (link.resource_type !== "policy") return [];
  // A disabled or expired link shows nothing.
  if (link.is_enabled === false) return [];
  if (link.expires_at && new Date() > new Date(link.expires_at)) return [];
  const warnings: ShareLinkWarning[] = [];
  if (isTableViewLink(link.resource_id)) warnings.push("policyList");
  // Same strict check as the shared view.
  if (link.settings?.shareAllFields === true) warnings.push("policyAllFields");
  // As the shared view: export is offered when allowDataExport is truthy. A link
  // created without settings gets the default, which turns it on.
  if (link.settings?.allowDataExport) warnings.push("policyExport");
  return warnings;
};
