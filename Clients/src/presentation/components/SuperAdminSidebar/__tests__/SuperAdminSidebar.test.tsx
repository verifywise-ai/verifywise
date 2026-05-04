import { vi } from "vitest";

vi.mock("../../../../application/repository/superAdmin.repository", () => ({
  getUserCount: vi.fn().mockResolvedValue({
    data: { data: { count: 42 } },
  }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/super-admin" }),
}));

vi.mock("../../Sidebar/SidebarShell", () => ({
  default: (props: { topItems: Array<{ id: string; label: string }> }) => (
    <div data-testid="sidebar-shell">
      {props.topItems.map((item) => (
        <div key={item.id} data-testid={`sidebar-item-${item.id}`}>
          {item.label}
        </div>
      ))}
    </div>
  ),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SuperAdminSidebar from "../index";

describe("SuperAdminSidebar", () => {
  it("renders sidebar with Organizations and Users items", () => {
    renderWithProviders(<SuperAdminSidebar />);
    expect(screen.getByTestId("sidebar-shell")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("renders Organizations item", () => {
    renderWithProviders(<SuperAdminSidebar />);
    expect(screen.getByTestId("sidebar-item-organizations")).toBeInTheDocument();
  });

  it("renders Users item", () => {
    renderWithProviders(<SuperAdminSidebar />);
    expect(screen.getByTestId("sidebar-item-users")).toBeInTheDocument();
  });
});
