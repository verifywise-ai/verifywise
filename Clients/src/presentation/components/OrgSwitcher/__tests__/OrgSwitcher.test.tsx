import { vi } from "vitest";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: vi.fn().mockReturnValue({
    isSuperAdmin: true,
    activeOrganizationId: 1,
  }),
}));

vi.mock("../../../../application/repository/superAdmin.repository", () => ({
  getOrganizations: vi.fn().mockResolvedValue({
    data: {
      data: [
        { id: 1, name: "Org One" },
        { id: 2, name: "Org Two" },
      ],
    },
  }),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import OrgSwitcher from "../index";
import { useAuth } from "../../../../application/hooks/useAuth";

describe("OrgSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when user is super admin", async () => {
    renderWithProviders(<OrgSwitcher />);
    expect(screen.getByText("View Organization")).toBeInTheDocument();
  });

  it("renders nothing when user is not super admin", () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      isSuperAdmin: false,
      activeOrganizationId: null,
    } as any);
    const { container } = renderWithProviders(<OrgSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a select element", () => {
    renderWithProviders(<OrgSwitcher />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
