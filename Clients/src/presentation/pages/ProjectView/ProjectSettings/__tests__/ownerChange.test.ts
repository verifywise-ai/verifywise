import { describe, expect, it } from "vitest";
import { EXTERNAL_OWNER_OPTION_ID } from "../../../../../application/utils/externalOwner";
import { ownerChangeForExternalEdit, ownerChangeForSelection, ownerParty } from "../ownerChange";

const users = [
  { id: 1, name: "Grace", surname: "Hopper" },
  { id: 2, name: "Alan", surname: "Turing" },
];
const userOwned = { owner: 1, externalOwnerName: "", externalOwnerEmail: "", members: [2] };
const externalOwned = {
  owner: EXTERNAL_OWNER_OPTION_ID,
  externalOwnerName: "Ada Lovelace",
  externalOwnerEmail: "ada@example.com",
  members: [2],
};

describe("ownerChangeForSelection", () => {
  it("confirms user to external", () => {
    const change = ownerChangeForSelection(userOwned, EXTERNAL_OWNER_OPTION_ID, users);
    expect(change?.from).toEqual({ name: "Grace Hopper", external: false });
    expect(change?.to).toEqual({ name: "an external owner", external: false });
    expect(change?.nextOwner).toBe(EXTERNAL_OWNER_OPTION_ID);
    expect(change?.removeMemberId).toBeUndefined();
  });

  it("confirms external to user, and removes a user who was a member", () => {
    const nonMember = ownerChangeForSelection(externalOwned, 1, users);
    expect(nonMember?.from).toEqual({ name: "Ada Lovelace", external: true });
    expect(nonMember?.to).toEqual({ name: "Grace Hopper", external: false });
    expect(nonMember?.removeMemberId).toBeUndefined();

    const member = ownerChangeForSelection(externalOwned, 2, users);
    expect(member?.removeMemberId).toBe(2);
  });

  it("keeps the existing rule for user to user", () => {
    expect(ownerChangeForSelection(userOwned, 3, users)).toBeNull();
    expect(ownerChangeForSelection(userOwned, 2, users)?.removeMemberId).toBe(2);
  });

  it("applies directly when no one is being replaced", () => {
    const empty = { owner: 0, externalOwnerName: "", externalOwnerEmail: "", members: [] };
    expect(ownerChangeForSelection(empty, EXTERNAL_OWNER_OPTION_ID, users)).toBeNull();
  });

  it("does nothing when the same option is picked again", () => {
    expect(ownerChangeForSelection(externalOwned, EXTERNAL_OWNER_OPTION_ID, users)).toBeNull();
  });
});

describe("ownerChangeForExternalEdit", () => {
  const edited = {
    ...externalOwned,
    externalOwnerName: "Bob Example",
    externalOwnerEmail: "bob@example.com",
  };

  it("confirms external to external and saves on proceed", () => {
    expect(ownerChangeForExternalEdit(externalOwned, edited, users)).toEqual({
      from: { name: "Ada Lovelace", external: true },
      to: { name: "Bob Example", external: true },
      nextOwner: EXTERNAL_OWNER_OPTION_ID,
      saveOnProceed: true,
    });
  });

  it("ignores an email that only changed case", () => {
    const sameEmail = { ...externalOwned, externalOwnerEmail: "ADA@Example.com" };
    expect(ownerChangeForExternalEdit(externalOwned, sameEmail, users)).toBeNull();
  });

  it("does not apply when the use case is not externally owned on both sides", () => {
    expect(ownerChangeForExternalEdit(userOwned, edited, users)).toBeNull();
    expect(ownerChangeForExternalEdit(externalOwned, userOwned, users)).toBeNull();
  });
});

describe("ownerParty", () => {
  it("is null with no name to show", () => {
    expect(ownerParty({ ...externalOwned, externalOwnerName: " " }, users)).toBeNull();
    expect(ownerParty({ ...userOwned, owner: 99 }, users)).toBeNull();
  });
});
