import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CustomException from "../../../../../infrastructure/exceptions/customeException";

vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  MY_PERMISSIONS_QUERY_KEY: ["my-permissions"],
  useMyPermissions: () => ({ permissions: undefined, isLoading: true, error: null }),
}));
vi.mock("../../../../../application/hooks/useCan", () => {
  const useCan = () => true;
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => true,
  };
});

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn(),
}));

vi.mock("../../../../../application/repository/role.repository", () => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getPermissionCatalog: vi.fn(),
  getRolePermissions: vi.fn(),
  replaceRolePermissions: vi.fn(),
}));

import RolesTab from "..";
import { getEntityById } from "../../../../../application/repository/entity.repository";
import {
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRolePermissions,
  updateRole,
} from "../../../../../application/repository/role.repository";

const BUILT_INS = [
  { id: 1, name: "Admin", description: "Full access", organization_id: null },
  { id: 2, name: "Reviewer", description: "Review", organization_id: null },
  { id: 3, name: "Editor", description: "Edit", organization_id: null },
  { id: 4, name: "Auditor", description: "Read only", organization_id: null },
];
const VALIDATOR = {
  id: 10,
  name: "Validator",
  description: "Validates models",
  organization_id: 7,
};

let serverRoles: Array<Record<string, unknown>> = [];

const mockGetEntity = vi.mocked(getEntityById);
const mockCreate = vi.mocked(createRole);
const mockUpdate = vi.mocked(updateRole);
const mockDelete = vi.mocked(deleteRole);

beforeEach(() => {
  vi.clearAllMocks();
  serverRoles = [...BUILT_INS];
  mockGetEntity.mockImplementation(async () => ({ data: serverRoles }));
  vi.mocked(getPermissionCatalog).mockResolvedValue([
    { key: "models.read", module: "Models", description: "See models" },
  ]);
  vi.mocked(getRolePermissions).mockResolvedValue([]);
});

const fillField = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RolesTab", () => {
  it("shows a task-first empty state and hides built-in roles", async () => {
    renderWithProviders(<RolesTab />);

    expect(await screen.findByText("No custom roles yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New role/ })).toBeInTheDocument();
    // Built-ins are never selectable or editable.
    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("roles-edit-role")).not.toBeInTheDocument();
    expect(screen.queryByTestId("roles-delete-role")).not.toBeInTheDocument();
  });

  it("creates a role and selects it so its permissions can be set", async () => {
    mockCreate.mockImplementation(async ({ body }) => {
      serverRoles = [...serverRoles, { id: 11, ...body, organization_id: 7 }];
      return { data: { data: { id: 11, ...body } }, status: 201 };
    });
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /New role/ }));
    fillField(/^Name/, "  Model validator  ");
    fillField(/^Description/, "Checks model documentation");
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: { name: "Model validator", description: "Checks model documentation" },
        suppressGlobalErrorToast: true,
      }),
    );
    // The new role is selected and its permission matrix is shown.
    expect(await screen.findByRole("button", { name: "Model validator" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await screen.findByText("models.read")).toBeInTheDocument();
    await waitFor(() =>
      expect(getRolePermissions).toHaveBeenCalledWith(expect.objectContaining({ id: 11 })),
    );
    expect(screen.queryByRole("button", { name: "Create role" })).not.toBeInTheDocument();
  });

  it("blocks a name reserved for a built-in role without calling the server", async () => {
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /New role/ }));
    fillField(/^Name/, "admin");
    fillField(/^Description/, "Sneaky");
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    expect(
      await screen.findByText("This name is reserved for a built-in role"),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows the server's error inline when creating fails", async () => {
    mockCreate.mockRejectedValue(
      new CustomException("A role with this name already exists", 400, undefined),
    );
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /New role/ }));
    fillField(/^Name/, "Validator two");
    fillField(/^Description/, "Duplicate");
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A role with this name already exists",
    );
    // The modal stays open so the user can fix the name.
    expect(screen.getByRole("button", { name: "Create role" })).toBeInTheDocument();
  });

  it("renames a custom role and edits its description", async () => {
    serverRoles = [...BUILT_INS, VALIDATOR];
    mockUpdate.mockImplementation(async ({ id, body }) => {
      serverRoles = serverRoles.map((r) => (r.id === id ? { ...r, ...body } : r));
      return { data: { data: { id, ...body } }, status: 202 };
    });
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByTestId("roles-edit-role"));
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Validator");
    fillField(/^Name/, "Senior validator");
    fillField(/^Description/, "Signs off validation");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 10,
        body: { name: "Senior validator", description: "Signs off validation" },
        suppressGlobalErrorToast: true,
      }),
    );
    expect(await screen.findByRole("button", { name: "Senior validator" })).toBeInTheDocument();
    expect(screen.getByText("Signs off validation")).toBeInTheDocument();
  });

  it("deletes a custom role after confirmation", async () => {
    serverRoles = [...BUILT_INS, VALIDATOR];
    mockDelete.mockImplementation(async ({ id }) => {
      serverRoles = serverRoles.filter((r) => r.id !== id);
      return { data: { data: VALIDATOR }, status: 202 };
    });
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByTestId("roles-delete-role"));
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete role" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({ id: 10, suppressGlobalErrorToast: true }),
    );
    expect(await screen.findByText("No custom roles yet")).toBeInTheDocument();
  });

  it("explains that people must be moved first when the role is still assigned", async () => {
    serverRoles = [...BUILT_INS, VALIDATOR];
    mockDelete.mockRejectedValue(
      new CustomException("Role is still assigned to users", 409, undefined),
    );
    renderWithProviders(<RolesTab />);

    fireEvent.click(await screen.findByTestId("roles-delete-role"));
    fireEvent.click(screen.getByRole("button", { name: "Delete role" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "People still have this role. Move them to another role in the Team tab, then try again.",
    );
    // The role is still listed (behind the still-open dialog, hence hidden).
    expect(
      within(screen.getByRole("group", { name: "Custom role", hidden: true })).getByText(
        "Validator",
      ),
    ).toBeInTheDocument();
  });
});
