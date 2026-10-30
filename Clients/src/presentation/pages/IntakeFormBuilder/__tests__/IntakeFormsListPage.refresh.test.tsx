import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormsListPage } from "../IntakeFormsListPage";
import { getPendingSubmissions } from "../../../../application/repository/intakeForm.repository";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: vi.fn(),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../SubmissionPreviewModal", () => ({
  SubmissionPreviewModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="review-modal">
        <button onClick={onClose}>Close review</button>
      </div>
    ) : null,
}));

vi.mock("../../../../application/repository/intakeForm.repository", async (orig) => ({
  ...(await orig<object>()),
  getAllIntakeForms: vi.fn().mockResolvedValue({ data: [] }),
  getPendingSubmissions: vi.fn(),
  getSubmissionPreview: vi.fn().mockResolvedValue({ data: {} }),
}));

const row = (id: number, submitterName: string) => ({
  id,
  formId: 1,
  status: "pending",
  submitterName,
  submitterEmail: `${submitterName.toLowerCase()}@example.com`,
  resubmissionCount: 0,
  routingEnabled: false,
  routing: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
});

let visibility: DocumentVisibilityState = "visible";

const nextPoll = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });

describe("IntakeFormsListPage background refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.mocked(useHasPermission).mockReturnValue(true);
    vi.mocked(getPendingSubmissions).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a new submission without a reload and keeps the search and status filter", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({
      data: [row(1, "Ada"), row(2, "Ben")],
    } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    expect(await screen.findByText("Ben")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search submissions..."), {
      target: { value: "ada" },
    });
    expect(screen.queryByText("Ben")).not.toBeInTheDocument();

    vi.mocked(getPendingSubmissions).mockResolvedValue({
      data: [row(3, "Adam"), row(1, "Ada"), row(2, "Ben")],
    } as never);
    await nextPoll();

    expect(screen.getByText("Adam")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Ben")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search submissions...")).toHaveValue("ada");
    expect(vi.mocked(getPendingSubmissions).mock.lastCall).toEqual([{}]);
  });

  it("asks for nothing while the browser tab is hidden and refreshes when it comes back", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({ data: [row(1, "Ada")] } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    const callsAfterLoad = vi.mocked(getPendingSubmissions).mock.calls.length;

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await nextPoll();
    await nextPoll();
    expect(getPendingSubmissions).toHaveBeenCalledTimes(callsAfterLoad);

    vi.mocked(getPendingSubmissions).mockResolvedValue({
      data: [row(2, "Ben"), row(1, "Ada")],
    } as never);
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("Ben")).toBeInTheDocument();
    expect(getPendingSubmissions).toHaveBeenCalledTimes(callsAfterLoad + 1);
  });

  it("pauses while the review modal is open", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({ data: [row(1, "Ada")] } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    fireEvent.click(await screen.findByText("Ada"));
    expect(screen.getByTestId("review-modal")).toBeInTheDocument();
    const callsWithModal = vi.mocked(getPendingSubmissions).mock.calls.length;

    await nextPoll();
    expect(getPendingSubmissions).toHaveBeenCalledTimes(callsWithModal);
  });

  it("refreshes when the review modal closes without a decision", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({ data: [row(1, "Ada")] } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    fireEvent.click(await screen.findByText("Ada"));

    vi.mocked(getPendingSubmissions).mockResolvedValue({
      data: [row(2, "Ben"), row(1, "Ada")],
    } as never);
    fireEvent.click(screen.getByText("Close review"));
    expect(await screen.findByText("Ben")).toBeInTheDocument();
  });

  it("doesn't let a background refresh replace a load in flight", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({ data: [row(1, "Ada")] } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    expect(await screen.findByText("Ada")).toBeInTheDocument();

    let resolveSlow: (value: unknown) => void = () => {};
    vi.mocked(getPendingSubmissions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSlow = resolve;
      }) as never,
    );
    fireEvent.click(await screen.findByText("Ada"));
    fireEvent.click(screen.getByText("Close review"));
    const callsWithSlowLoad = vi.mocked(getPendingSubmissions).mock.calls.length;

    await nextPoll();
    expect(getPendingSubmissions).toHaveBeenCalledTimes(callsWithSlowLoad);

    await act(async () => {
      resolveSlow({ data: [row(3, "Cara"), row(1, "Ada")] });
    });
    expect(screen.getByText("Cara")).toBeInTheDocument();
  });

  it("keeps the list and shows no error when a background refresh fails", async () => {
    vi.mocked(getPendingSubmissions).mockResolvedValue({ data: [row(1, "Ada")] } as never);
    renderWithProviders(<IntakeFormsListPage />, { route: "/intake-forms/submissions" });
    expect(await screen.findByText("Ada")).toBeInTheDocument();

    vi.mocked(getPendingSubmissions).mockRejectedValue(new Error("offline"));
    await nextPoll();

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load submissions")).not.toBeInTheDocument();
  });
});
