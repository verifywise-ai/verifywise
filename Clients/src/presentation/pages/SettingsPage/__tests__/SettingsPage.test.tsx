import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockRole = "Admin";
let mockHasOrganizationAdmin = true;
let mockPermissionsLoading = false;
let mockIsSuperAdmin = false;

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: mockRole,
    isSuperAdmin: mockIsSuperAdmin,
  }),
}));
let mockHasRolesManage = false;
vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  // While loading (or disabled, before a user is known) React Query has no
  // data; v5 reports a disabled query as not loading.
  useMyPermissions: () => ({
    permissions: mockPermissionsLoading
      ? undefined
      : [
          ...(mockHasOrganizationAdmin ? ["organization.admin"] : []),
          ...(mockHasRolesManage ? ["roles.manage"] : []),
        ],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../../../../application/hooks/useCan", () => {
  const useCan = (key: string) =>
    !mockPermissionsLoading &&
    ((key === "organization.admin" && mockHasOrganizationAdmin) ||
      (key === "roles.manage" && mockHasRolesManage));
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => !mockPermissionsLoading,
  };
});

// RolesTab mounts (hidden) whenever the tab is permitted — its hooks must not
// throw or the whole settings page falls into the error boundary (#5253).
vi.mock("../../../../application/hooks/useRoles", () => ({
  useRoles: () => ({ roles: [], loading: false, error: null, refreshRoles: vi.fn() }),
}));
vi.mock("../../../../application/hooks/useRolePermissions", () => ({
  usePermissionCatalog: () => ({ data: [], isLoading: false }),
  useRolePermissions: () => ({ data: [], isLoading: false }),
  useReplaceRolePermissions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mock child tab components
vi.mock("../Profile/index", () => ({
  default: () => <div data-testid="profile-tab" />,
}));

vi.mock("../Password/index", () => ({
  default: () => <div data-testid="password-tab" />,
}));

vi.mock("../Team/index", () => ({
  default: () => <div data-testid="team-tab" />,
}));

vi.mock("../Organization", () => ({
  default: () => <div data-testid="organization-tab" />,
}));

vi.mock("../Preferences/index", () => ({
  default: () => <div data-testid="preferences-tab" />,
}));

vi.mock("../Features/index", () => ({
  default: () => <div data-testid="features-tab" />,
}));

vi.mock("../ApiKeys", () => ({
  default: () => <div data-testid="apikeys-tab" />,
}));

vi.mock("../McpConnect", () => ({
  default: ({ disabledReason }: { disabledReason?: string }) => (
    <div data-testid="mcp-tab">
      {disabledReason && <p data-testid="mcp-disabled">{disabledReason}</p>}
    </div>
  ),
}));

vi.mock("../AuditLedger", () => ({
  default: () => <div data-testid="audit-ledger-tab" />,
}));

vi.mock("../DataRetention", () => ({
  default: () => <div data-testid="data-retention-tab" />,
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
  HelperIcon: () => null,
}));

import ProfilePage from "../index";

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

/** Render the page under the real /settings/:tab route, as the app does. */
function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/settings/:tab?"
        element={
          <>
            <ProfilePage />
            <PathProbe />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = "Admin";
    mockHasOrganizationAdmin = true;
    mockPermissionsLoading = false;
    mockIsSuperAdmin = false;
  });

  it("opens the Data retention tab from a direct link when permitted", () => {
    renderAt("/settings/data-retention");
    expect(screen.getByTestId("data-retention-tab")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/data-retention");
  });

  it("falls back to the default tab on a direct link without organization.admin", () => {
    mockRole = "Editor";
    mockHasOrganizationAdmin = false;
    renderAt("/settings/data-retention");
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/settings$/);
    expect(screen.getByTestId("profile-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("data-retention-tab")).not.toBeInTheDocument();
  });

  it("stays on the tab when permissions are loaded and include organization.admin", () => {
    mockRole = "Compliance lead";
    renderAt("/settings/data-retention");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/data-retention");
    expect(screen.getByTestId("data-retention-tab")).toBeInTheDocument();
  });

  it("does not redirect while the permissions query is disabled or pending", () => {
    mockPermissionsLoading = true;
    renderAt("/settings/data-retention");
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/data-retention");
  });

  it("shows the Data retention tab to a custom role granted organization.admin", () => {
    mockRole = "Compliance lead";
    renderWithProviders(<ProfilePage />, { route: "/settings" });
    expect(screen.getByText("Data retention")).toBeInTheDocument();
    // The audit ledger tab still follows the Admin role.
    expect(screen.queryByText("Audit ledger")).not.toBeInTheDocument();
  });

  it("hides the Data retention tab without organization.admin", () => {
    mockRole = "Editor";
    mockHasOrganizationAdmin = false;
    renderWithProviders(<ProfilePage />, { route: "/settings" });
    expect(screen.queryByText("Data retention")).not.toBeInTheDocument();
  });

  it("opens the MCP tab for an Admin", () => {
    renderAt("/settings/mcp");
    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/settings/mcp");
    expect(screen.getByTestId("mcp-tab")).toBeInTheDocument();
  });

  it("leaves the MCP tab usable for an Admin who is not a super admin", () => {
    renderAt("/settings/mcp");
    expect(screen.queryByTestId("mcp-disabled")).not.toBeInTheDocument();
  });

  /** Their connection belongs in the super admin console, which adds the super-admin tools. */
  it("shows the MCP tab disabled, with the reason, to an Admin who is also a super admin", () => {
    mockIsSuperAdmin = true;
    renderAt("/settings/mcp");
    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-disabled")).toHaveTextContent(
      "set up MCP from Super Admin → Settings → MCP",
    );
  });

  /** The MCP server refuses anyone else, so the tab is not offered at all. */
  it("hides the MCP tab from every role but Admin", () => {
    mockRole = "Editor";
    renderWithProviders(<ProfilePage />, { route: "/settings" });
    expect(screen.queryByText("MCP")).not.toBeInTheDocument();
  });

  it("falls back to the default tab on a direct MCP link for a non-Admin", () => {
    mockRole = "Reviewer";
    renderAt("/settings/mcp");
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/settings$/);
    expect(screen.queryByTestId("mcp-tab")).not.toBeInTheDocument();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: "/settings",
    });
    expect(container).toBeTruthy();
  });

  it("mounts the Roles tab panel without crashing when roles.manage is granted", () => {
    mockHasRolesManage = true;
    renderWithProviders(<ProfilePage />, { route: "/settings" });
    // The tab is offered and the (hidden) panel mounted — the page itself
    // must still render the default profile tab.
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByTestId("profile-tab")).toBeInTheDocument();
  });
});
