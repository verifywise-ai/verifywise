import { vi } from "vitest";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: vi.fn().mockReturnValue({
    isSuperAdmin: true,
    activeOrganizationId: 1,
  }),
}));

vi.mock("../../../../application/repository/superAdmin.repository", () => ({
  getOrganizations: vi.fn().mockResolvedValue({
    data: { data: [{ id: 1, name: "Org One" }] },
  }),
}));

vi.mock("../../../utils/inputStyles", () => ({
  getSelectStyles: () => ({}),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReadOnlyBanner from "../index";
import { useAuth } from "../../../../application/hooks/useAuth";

describe("ReadOnlyBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the read-only message when super admin is viewing org", () => {
    renderWithProviders(<ReadOnlyBanner />);
    expect(screen.getByText(/Super Admin view \(read-only\)/)).toBeInTheDocument();
  });

  it("renders Manage organizations button", () => {
    renderWithProviders(<ReadOnlyBanner />);
    expect(screen.getByText("Manage organizations")).toBeInTheDocument();
  });

  it("renders nothing when user is not super admin", () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      isSuperAdmin: false,
      activeOrganizationId: null,
    } as any);
    const { container } = renderWithProviders(<ReadOnlyBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no active organization", () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      isSuperAdmin: true,
      activeOrganizationId: null,
    } as any);
    const { container } = renderWithProviders(<ReadOnlyBanner />);
    expect(container.firstChild).toBeNull();
  });
});
