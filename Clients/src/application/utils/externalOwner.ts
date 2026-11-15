import { isValidEmail } from "../validations/emailAddress.rule";

/**
 * External use case owners (#5256): a person with a name and an email but no
 * VerifyWise account. They get email notices only and have no access.
 */

/** Value of the "External owner" entry in the owner select; never a real user id. */
export const EXTERNAL_OWNER_OPTION_ID = -1;
export const EXTERNAL_OWNER_OPTION = { _id: EXTERNAL_OWNER_OPTION_ID, name: "External owner" };

const NAME_MAX_LENGTH = 255;
const EMAIL_MAX_LENGTH = 254;

export interface OwnerFields {
  owner?: number | null;
  external_owner_name?: string | null;
  external_owner_email?: string | null;
}

/** The owner select's value for a stored use case. */
export function ownerSelectValue(project: OwnerFields): number {
  if (project.owner) return project.owner;
  return project.external_owner_email ? EXTERNAL_OWNER_OPTION_ID : 0;
}

/** The ownership part of a create or update body for a value of the owner select. */
export function externalOwnerPayload(
  owner: number,
  name: string | null | undefined,
  email: string | null | undefined,
) {
  if (owner === EXTERNAL_OWNER_OPTION_ID) {
    return {
      owner: null,
      external_owner_name: (name ?? "").trim(),
      external_owner_email: (email ?? "").trim(),
    };
  }
  return { owner, external_owner_name: null, external_owner_email: null };
}

export function validateExternalOwner(
  name: string | null | undefined,
  email: string | null | undefined,
): { name?: string; email?: string } {
  const errors: { name?: string; email?: string } = {};
  const trimmedName = (name ?? "").trim();
  const trimmedEmail = (email ?? "").trim();

  if (!trimmedName) errors.name = "Name is required";
  else if (trimmedName.length > NAME_MAX_LENGTH) {
    errors.name = "Name must be at most 255 characters";
  }

  if (!trimmedEmail) errors.email = "Email is required";
  else if (trimmedEmail.length > EMAIL_MAX_LENGTH) {
    errors.email = "Email must be at most 254 characters";
  } else if (!isValidEmail(trimmedEmail)) errors.email = "Enter a valid email address";

  return errors;
}

/** Plain-text owner name for places that cannot render the icon (filters, exports). */
export const externalOwnerLabel = (name: string): string => `${name} (external)`;

/** A key identifying the owner of either kind, for filtering a list. */
export function ownerFilterValue(project: OwnerFields): string | undefined {
  if (project.owner) return project.owner.toString();
  return project.external_owner_email ? `external:${project.external_owner_email}` : undefined;
}
