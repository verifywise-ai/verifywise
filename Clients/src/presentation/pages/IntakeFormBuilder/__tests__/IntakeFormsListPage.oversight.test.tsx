import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormsListPage } from "../IntakeFormsListPage";
import {
  getPendingSubmissions,
  getSubmissionPreview,
} from "../../../../application/repository/intakeForm.repository";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: vi.fn(),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../oversight/OversightTab", () => ({
  OversightTab: ({
    refreshKey,
    onOpenSubmission,
  }: {
    refreshKey?: number;
    onOpenSubmission: (id: number) => void;
  }) => (
    <div data-testid="oversight-tab" data-refresh={refreshKey}>
      <button onClick={() => onOpenSubmission(5)}>open-submission</button>
    </div>
  ),
}));

vi.mock("../SubmissionPreviewModal", () => ({
  SubmissionPreviewModal: ({ isOpen, onApproved }: { isOpen: boolean; onApproved: () => void }) =>
    isOpen ? <button onClick={onApproved}>decide</button> : null,
}));

vi.mock("../../../../application/repository/intakeForm.repository", async (orig) => ({
  ...(await orig<object>()),
  getAllIntakeForms: vi.fn().mockResolvedValue({ data: [] }),
  getPendingSubmissions: vi.fn().mockResolvedValue({ data: [] }),
  getSubmissionPreview: vi.fn().mockResolvedValue({ data: {} }),
}));

describe("IntakeFormsListPage oversight tab", () => {
  it("hides the tab and the content without intakeForm.edit", async () => {
    vi.mocked(useHasPermission).mockReturnValue(false);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/oversight" });
    expect(await screen.findByText("Forms")).toBeInTheDocument();
    expect(screen.queryByText("Oversight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oversight-tab")).not.toBeInTheDocument();
  });

  it("shows the tab and its content with intakeForm.edit", async () => {
    vi.mocked(useHasPermission).mockReturnValue(true);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/oversight" });
    expect(await screen.findByText("Oversight")).toBeInTheDocument();
    expect(screen.getByTestId("oversight-tab")).toBeInTheDocument();
  });

  it("reloads the oversight figures after a decision in the modal", async () => {
    vi.mocked(useHasPermission).mockReturnValue(true);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/oversight" });
    const tab = await screen.findByTestId("oversight-tab");
    expect(tab).toHaveAttribute("data-refresh", "0");
    fireEvent.click(screen.getByText("open-submission"));
    fireEvent.click(await screen.findByText("decide"));
    expect(screen.getByTestId("oversight-tab")).toHaveAttribute("data-refresh", "1");
  });
});

describe("IntakeFormsListPage second review", () => {
  beforeEach(() => {
    vi.mocked(useHasPermission).mockReturnValue(true);
  });

  it("opens the submission named in the link and clears the param", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=42",
    });
    expect(await screen.findByText("decide")).toBeInTheDocument();
    expect(getSubmissionPreview).toHaveBeenCalledWith(42);
  });

  it("shows a notice for an unknown submission", async () => {
    vi.mocked(getSubmissionPreview).mockRejectedValueOnce(new Error("404"));
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=999",
    });
    expect(await screen.findByText("That submission could not be found")).toBeInTheDocument();
    expect(screen.queryByText("decide")).not.toBeInTheDocument();
  });

  it("shows a notice for an invalid id without asking the server", async () => {
    vi.mocked(getSubmissionPreview).mockClear();
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=abc",
    });
    expect(await screen.findByText("That submission could not be found")).toBeInTheDocument();
    expect(getSubmissionPreview).not.toHaveBeenCalled();
  });

  it("marks a row with an open second review with a chip", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValueOnce({
      data: [
        {
          id: 7,
          formId: 1,
          status: "approved",
          resubmissionCount: 0,
          routingEnabled: false,
          routing: {
            lane: "standard",
            secondReview: { status: "open", selectedAt: "2026-10-20T00:00:00Z" },
          },
          createdAt: "2026-10-20T00:00:00Z",
          updatedAt: "2026-10-20T00:00:00Z",
        },
      ],
    } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    expect(await screen.findByText("Second review")).toBeInTheDocument();
  });
});
