import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const transaction = { commit: jest.fn(), rollback: jest.fn() };

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => transaction),
    query: jest.fn(async () => [{ id: 9 }]),
  },
}));
jest.mock("../../domain.layer/models/organization/organization.model", () => ({
  OrganizationModel: {},
}));
jest.mock("../../utils/organization.utils", () => ({ createOrganizationQuery: jest.fn() }));
jest.mock("../../controllers/user.ctrl", () => ({ createNewUserWrapper: jest.fn() }));
jest.mock("../../utils/invitation.utils", () => ({ createInvitationQuery: jest.fn() }));
jest.mock("../../utils/inviteRole.utils", () => ({ inviteRoleRefusal: jest.fn(async () => null) }));
jest.mock("../../utils/jwt.utils", () => ({ INVITATION_LIFETIME_MS: 1 }));
jest.mock("../../utils/user.utils", () => ({
  deleteUserAccountQuery: jest.fn(),
  getUserByEmailQuery: jest.fn(),
  getUserByIdQuery: jest.fn(async () => ({ id: 9 })),
  isLastAdminQuery: jest.fn(),
  removeUserFromOrganizationQuery: jest.fn(async () => ({ removed: true, accountDeleted: false })),
}));
jest.mock("../../utils/organizationMember.utils", () => ({
  addOrganizationMemberQuery: jest.fn(),
  getUserOrganizationsQuery: jest.fn(),
  updateOrganizationMemberRoleQuery: jest.fn(),
}));

import {
  removeUserById,
  removeUserFromOrganization,
  updateUserDetails,
} from "../superAdmin.service";
import {
  deleteUserAccountQuery,
  isLastAdminQuery,
  removeUserFromOrganizationQuery,
} from "../../utils/user.utils";
import {
  getUserOrganizationsQuery,
  updateOrganizationMemberRoleQuery,
} from "../../utils/organizationMember.utils";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";

const mockIsLastAdmin = isLastAdminQuery as jest.MockedFunction<typeof isLastAdminQuery>;
const mockOrganizations = getUserOrganizationsQuery as jest.MockedFunction<
  typeof getUserOrganizationsQuery
>;

const ACME = { organization_id: 1, organization_name: "Acme", role_id: 1, role_name: "Admin" };
const GLOBEX = { organization_id: 2, organization_name: "Globex", role_id: 1, role_name: "Admin" };

describe("superAdmin.service keeps an Admin in every organization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrganizations.mockResolvedValue([ACME, GLOBEX]);
  });

  it("refuses to remove the last Admin from an organization", async () => {
    mockIsLastAdmin.mockResolvedValue(true);
    await expect(removeUserFromOrganization(1, 9)).rejects.toBeInstanceOf(ConflictException);
    expect(removeUserFromOrganizationQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("removes an Admin who is not the last one", async () => {
    mockIsLastAdmin.mockResolvedValue(false);
    await expect(removeUserFromOrganization(1, 9)).resolves.toMatchObject({ removed: true });
    expect(isLastAdminQuery).toHaveBeenCalledWith(1, 9, transaction);
  });

  it("refuses to demote the last Admin", async () => {
    mockIsLastAdmin.mockResolvedValue(true);
    await expect(updateUserDetails(9, { roleId: 3, organizationId: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(updateOrganizationMemberRoleQuery).not.toHaveBeenCalled();
  });

  it("refuses to delete an account that is the last Admin of any of its organizations", async () => {
    mockIsLastAdmin.mockImplementation(async (orgId) => orgId === 2);
    await expect(removeUserById(9)).rejects.toBeInstanceOf(ConflictException);
    expect(deleteUserAccountQuery).not.toHaveBeenCalled();
  });

  it("deletes an account that is not the last Admin anywhere", async () => {
    mockIsLastAdmin.mockResolvedValue(false);
    await expect(removeUserById(9)).resolves.toEqual({ deleted: true, userId: 9 });
    expect(deleteUserAccountQuery).toHaveBeenCalled();
  });
});
