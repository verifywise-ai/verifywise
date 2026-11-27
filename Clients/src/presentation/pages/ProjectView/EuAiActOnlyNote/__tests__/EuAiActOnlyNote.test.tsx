import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const { authRole, navigateMock } = vi.hoisted(() => ({
  authRole: { name: "Admin" },
  navigateMock: vi.fn(),
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: authRole.name }),
}));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import EuAiActOnlyNote from "../index";

describe("EuAiActOnlyNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRole.name = "Admin";
  });

  it("says the tab applies with the EU AI Act", () => {
    renderWithProviders(<EuAiActOnlyNote projectId="7" />);
    expect(screen.getByRole("status")).toHaveTextContent("Applies when the EU AI Act is added.");
  });

  it("sends a role that manages frameworks to the add framework dialog", () => {
    renderWithProviders(<EuAiActOnlyNote projectId="7" />);
    fireEvent.click(screen.getByRole("button", { name: "Add EU AI Act" }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/project-view?projectId=7&tab=frameworks&addFramework=1",
    );
  });

  it("offers no button to a role that cannot manage frameworks", () => {
    authRole.name = "Auditor";
    renderWithProviders(<EuAiActOnlyNote projectId="7" />);
    expect(screen.queryByRole("button", { name: "Add EU AI Act" })).not.toBeInTheDocument();
  });
});
