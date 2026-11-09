import { EXTERNAL_OWNER_OPTION_ID } from "../../../../application/utils/externalOwner";

/** One side of an owner change as shown in the confirmation modal. */
export interface OwnerParty {
  name: string;
  external: boolean;
}

export interface PendingOwnerChange {
  from: OwnerParty | null;
  to: OwnerParty | null;
  /** The owner select value to apply on confirmation. */
  nextOwner: number;
  removeMemberId?: number;
  /** Set when confirming an edit made in the external fields: save right after. */
  saveOnProceed?: boolean;
}

/** The fields of the settings form this module needs. */
export interface OwnerFormValues {
  owner: number;
  externalOwnerName: string;
  externalOwnerEmail: string;
  members: number[];
}

interface OwnerUser {
  id?: number;
  name: string;
  surname: string;
}

export function ownerParty(values: OwnerFormValues, users: OwnerUser[]): OwnerParty | null {
  if (values.owner === EXTERNAL_OWNER_OPTION_ID) {
    const name = values.externalOwnerName.trim();
    return name ? { name, external: true } : null;
  }
  const user = users.find((u) => u.id === values.owner);
  return user ? { name: `${user.name} ${user.surname}`, external: false } : null;
}

/**
 * The confirmation a change of the owner select needs, or null to apply it
 * directly. Confirmed: switching between a user owner and an external owner
 * when someone is being replaced, and picking a user who is already a member
 * (the existing rule, because that user is removed from the members list).
 */
export function ownerChangeForSelection(
  values: OwnerFormValues,
  selected: number,
  users: OwnerUser[],
): PendingOwnerChange | null {
  if (selected === values.owner) return null;
  const selectingExternal = selected === EXTERNAL_OWNER_OPTION_ID;
  const switchingKind = selectingExternal !== (values.owner === EXTERNAL_OWNER_OPTION_ID);
  const isMember = values.members.includes(selected);
  const from = ownerParty(values, users);
  if (!(switchingKind && from) && !isMember) return null;

  const user = users.find((u) => u.id === selected);
  return {
    from,
    to: selectingExternal
      ? { name: "an external owner", external: false }
      : user
        ? { name: `${user.name} ${user.surname}`, external: false }
        : null,
    nextOwner: selected,
    removeMemberId: isMember ? selected : undefined,
  };
}

/**
 * The confirmation for replacing one external owner with another. That is typed
 * into the fields, so the select never fires: it is checked before saving.
 * Null when the external owner did not change (a change of email case does not count).
 */
export function ownerChangeForExternalEdit(
  initial: OwnerFormValues,
  values: OwnerFormValues,
  users: OwnerUser[],
): PendingOwnerChange | null {
  const bothExternal =
    initial.owner === EXTERNAL_OWNER_OPTION_ID && values.owner === EXTERNAL_OWNER_OPTION_ID;
  if (!bothExternal) return null;
  const changed =
    initial.externalOwnerName.trim() !== values.externalOwnerName.trim() ||
    initial.externalOwnerEmail.trim().toLowerCase() !==
      values.externalOwnerEmail.trim().toLowerCase();
  if (!changed) return null;
  return {
    from: ownerParty(initial, users),
    to: ownerParty(values, users),
    nextOwner: EXTERNAL_OWNER_OPTION_ID,
    saveOnProceed: true,
  };
}
