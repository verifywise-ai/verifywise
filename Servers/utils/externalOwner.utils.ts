import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { emailValidation } from "../domain.layer/validations/email.valid";

/**
 * External use case owners (#5256).
 *
 * A use case is owned either by a user (`owner`) or by an external person
 * (`external_owner_name` + `external_owner_email`), who has no account and only
 * ever receives email. Exactly one applies: selecting one clears the other. On
 * the v1 API, a create or an update that touches ownership must leave one in place.
 *
 * The rule lives here, not in a database CHECK: deleting a user sets
 * projects.owner to NULL, and a CHECK would make that delete fail.
 */

export const EXTERNAL_OWNER_NAME_MAX_LENGTH = 255;
export const EXTERNAL_OWNER_EMAIL_MAX_LENGTH = 254;

const OWNER_REQUIRED = "A use case needs an owner or an external owner";
const OWNER_CONFLICT = "A use case cannot have both an owner and an external owner";
const EXTERNAL_INCOMPLETE = "An external owner needs both a name and an email";
const EXTERNAL_NAME_INVALID = "External owner name is not valid";
const EXTERNAL_EMAIL_INVALID = "External owner email is not valid";

export interface OwnerFields {
  owner?: number | null;
  external_owner_name?: string | null;
  external_owner_email?: string | null;
}

export type OwnerAssignment = {
  owner: number | null;
  external_owner_name: string | null;
  external_owner_email: string | null;
};

/**
 * requireOwner: reject a write that leaves no owner. On for the v1 API; the
 * layers shared with the frozen legacy API and internal callers leave it off.
 */
export interface OwnerRuleOptions {
  requireOwner?: boolean;
}

const fail = (message: string, field: string, value: unknown): never => {
  throw new ValidationException(message, field, value, { i18nKey: message });
};

/** undefined = not sent, null = cleared (including a blank string). */
const toTrimmed = (value: unknown, field: string, message: string): string | null | undefined => {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return fail(message, field, value);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

// Control characters (line breaks above all) have no place in a person's name
// and would be dangerous if the name ever reached a mail header.
const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

/** A cleaned external owner name, or undefined/null when absent. Throws when invalid. */
export const normaliseExternalOwnerName = (value: unknown): string | null | undefined => {
  const name = toTrimmed(value, "external_owner_name", EXTERNAL_NAME_INVALID);
  if (name && (name.length > EXTERNAL_OWNER_NAME_MAX_LENGTH || hasControlCharacters(name))) {
    return fail(EXTERNAL_NAME_INVALID, "external_owner_name", value);
  }
  return name;
};

/** A lowercase external owner email, or undefined/null when absent. Throws when invalid. */
export const normaliseExternalOwnerEmail = (value: unknown): string | null | undefined => {
  const email = toTrimmed(value, "external_owner_email", EXTERNAL_EMAIL_INVALID);
  if (email && (email.length > EXTERNAL_OWNER_EMAIL_MAX_LENGTH || !emailValidation(email))) {
    return fail(EXTERNAL_EMAIL_INVALID, "external_owner_email", value);
  }
  return email ? email.toLowerCase() : email;
};

const isSet = (owner: number | null | undefined): owner is number =>
  owner !== undefined && owner !== null;

/** The ownership columns for a new use case. Throws when the rule is not met. */
export function resolveOwnerForCreate(
  input: OwnerFields,
  { requireOwner = true }: OwnerRuleOptions = {},
): OwnerAssignment {
  const name = normaliseExternalOwnerName(input.external_owner_name);
  const email = normaliseExternalOwnerEmail(input.external_owner_email);

  if (isSet(input.owner)) {
    if (name || email) fail(OWNER_CONFLICT, "owner", input.owner);
    return { owner: input.owner, external_owner_name: null, external_owner_email: null };
  }
  if (!name && !email) {
    if (requireOwner) fail(OWNER_REQUIRED, "owner", input.owner);
    return { owner: null, external_owner_name: null, external_owner_email: null };
  }
  if (!name || !email) fail(EXTERNAL_INCOMPLETE, "external_owner_email", email);
  return { owner: null, external_owner_name: name!, external_owner_email: email! };
}

/**
 * The ownership columns an update should write, given the stored row. Empty
 * when the update does not touch ownership, so a partial update (status, title)
 * leaves a legacy row whose owner was deleted exactly as it is.
 */
export function resolveOwnerForUpdate(
  input: OwnerFields,
  current: OwnerFields,
  { requireOwner = true }: OwnerRuleOptions = {},
): Partial<OwnerAssignment> {
  const name = normaliseExternalOwnerName(input.external_owner_name);
  const email = normaliseExternalOwnerEmail(input.external_owner_email);

  if (isSet(input.owner)) {
    if (name || email) fail(OWNER_CONFLICT, "owner", input.owner);
    return { owner: input.owner, external_owner_name: null, external_owner_email: null };
  }

  if (name || email) {
    const nextName = name === undefined ? (current.external_owner_name ?? null) : name;
    const nextEmail = email === undefined ? (current.external_owner_email ?? null) : email;
    if (!nextName || !nextEmail) fail(EXTERNAL_INCOMPLETE, "external_owner_email", email);
    return { owner: null, external_owner_name: nextName, external_owner_email: nextEmail };
  }

  if (name === null || email === null) {
    // The external fields were cleared. A user owner that stays is fine, and so
    // is a row that had no owner of either kind to lose.
    const keepsUserOwner = input.owner === undefined && isSet(current.owner);
    const hadNoOwner = !isSet(current.owner) && !current.external_owner_email;
    if (requireOwner && !keepsUserOwner && !hadNoOwner) {
      fail(OWNER_REQUIRED, "owner", input.owner);
    }
    return { external_owner_name: null, external_owner_email: null };
  }

  // owner: null on a row with no user owner changes nothing: clients that send
  // the whole form repeat it for an external owner, or after the user was deleted.
  if (input.owner === null && requireOwner && isSet(current.owner)) {
    fail(OWNER_REQUIRED, "owner", input.owner);
  }

  return {};
}

/** Legacy /api/projects requests cannot set external owners: the fields are ignored. */
export function stripExternalOwnerFields(body: Record<string, unknown>): void {
  delete body.external_owner_name;
  delete body.external_owner_email;
}

/** How an external owner is named wherever the owner is shown as plain text. */
export const formatExternalOwnerName = (name: string): string => `${name} (external)`;
