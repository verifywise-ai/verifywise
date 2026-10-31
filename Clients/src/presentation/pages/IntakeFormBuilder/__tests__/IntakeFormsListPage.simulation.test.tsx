import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormsListPage } from "../IntakeFormsListPage";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../oversight/OversightTab", () => ({
  OversightTab: () => <div data-testid="oversight-tab" />,
}));

// Shows what the page hands the review modal.
vi.mock("../SubmissionPreviewModal", () => ({
  SubmissionPreviewModal: ({ simulatedRole }: { simulatedRole: string | null }) => (
    <div data-testid="modal-role">{simulatedRole ?? "none"}</div>
  ),
}));

vi.mock("../../../../application/repository/intakeForm.repository", async (orig) => ({
  ...(await orig<object>()),
  getAllIntakeForms: vi.fn().mockResolvedValue({ data: [] }),
  getPendingSubmissions: vi.fn().mockResolvedValue({ data: [] }),
  getSubmissionPreview: vi.fn().mockResolvedValue({ data: {} }),
}));

describe("IntakeFormsListPage preview as a role", () => {
  it("shows the banner and passes the role to the review modal", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?simulateRole=standard",
    });
    expect(await screen.findByTestId("preview-role-banner-title")).toHaveTextContent(
      "Previewing as Regular reviewer, simulation only",
    );
    expect(screen.getByTestId("modal-role")).toHaveTextContent("standard");
  });

  it("switches role in place and exits back to the real view", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?simulateRole=standard",
    });
    fireEvent.click(await screen.findByTestId("button-preview-switch-role"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Expert reviewer" }));
    expect(await screen.findByTestId("preview-role-banner-title")).toHaveTextContent(
      "Previewing as Expert reviewer, simulation only",
    );
    expect(screen.getByTestId("modal-role")).toHaveTextContent("senior");

    fireEvent.click(screen.getByTestId("button-preview-exit"));
    expect(screen.queryByTestId("preview-role-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("modal-role")).toHaveTextContent("none");
  });

  it("changes nothing without the param, or with an unknown role", async () => {
    const { unmount } = renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions",
    });
    expect(await screen.findByTestId("modal-role")).toHaveTextContent("none");
    expect(screen.queryByTestId("preview-role-banner")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?simulateRole=superadmin",
    });
    expect(await screen.findByTestId("modal-role")).toHaveTextContent("none");
    expect(screen.queryByTestId("preview-role-banner")).not.toBeInTheDocument();
  });
});
