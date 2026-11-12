import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormsListPage } from "../IntakeFormsListPage";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: undefined, isLoading: true, error: null }),
}));
vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: () => true,
  useCanCheck: () => () => true,
  usePermissionsSettled: () => true,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../SubmissionPreviewModal", () => ({
  SubmissionPreviewModal: ({
    isOpen,
    onApproved,
  }: {
    isOpen: boolean;
    onApproved: (skips?: Array<{ label: string; reason: string }>) => void;
  }) =>
    isOpen ? (
      <>
        <button onClick={() => onApproved([{ label: "Tier", reason: "Value is not an option" }])}>
          approve-with-skips
        </button>
        <button onClick={() => onApproved([])}>approve-clean</button>
      </>
    ) : null,
}));

vi.mock("../../../../application/repository/intakeForm.repository", async (orig) => ({
  ...(await orig<object>()),
  getAllIntakeForms: vi.fn().mockResolvedValue({ data: [] }),
  getPendingSubmissions: vi.fn().mockResolvedValue({ data: [] }),
  getSubmissionPreview: vi.fn().mockResolvedValue({ data: {} }),
}));

describe("IntakeFormsListPage approval with skipped custom field values", () => {
  it("warns about the custom field values that were not saved", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=5",
    });
    fireEvent.click(await screen.findByText("approve-with-skips"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tier");
    expect(alert).toHaveTextContent("Value is not an option");
    expect(alert.className).toMatch(/Warning/);
  });

  it("shows the plain success message when nothing was skipped", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=5",
    });
    fireEvent.click(await screen.findByText("approve-clean"));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Submission approved")).toBeInTheDocument();
    expect(alert.className).toMatch(/Success/);
  });

  it("keeps the warning when the user clicks elsewhere, until it is closed", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=5",
    });
    fireEvent.click(await screen.findByText("approve-with-skips"));
    const alert = await screen.findByRole("alert");
    // The click-away listener arms on the next tick; the exit transition takes a moment.
    await new Promise((resolve) => setTimeout(resolve, 50));
    fireEvent.click(document.body);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByRole("alert")).toBe(alert);
    fireEvent.click(within(alert).getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("still lets a click elsewhere dismiss a success message", async () => {
    renderWithProviders(<IntakeFormsListPage />, {
      route: "/intake-forms/submissions?submission=5",
    });
    fireEvent.click(await screen.findByText("approve-clean"));
    await screen.findByRole("alert");
    await new Promise((resolve) => setTimeout(resolve, 50));
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
