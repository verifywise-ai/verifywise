import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

// Controllable async-generate lifecycle mocks (useGenerateReport enqueue +
// useReportRun poll + downloadReportRun blob fetch).
const mockReporting = vi.hoisted(() => ({
  reportRun: { data: undefined } as { data: unknown },
  mutate: vi.fn(),
}));
vi.mock("../../../../../application/hooks/useReporting", () => ({
  useGenerateReport: () => ({ mutate: mockReporting.mutate, isPending: false }),
  useReportRun: () => mockReporting.reportRun,
}));

const mockDownload = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../../../../application/repository/reporting.repository", () => ({
  downloadReportRun: (...args: unknown[]) => mockDownload.fn(...args),
}));

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

const mockLLMKeyStatus = vi.hoisted(() => ({
  data: { hasKeys: true, keyCount: 1, providers: ["Anthropic"] } as any,
  loading: false,
  error: null as string | null,
}));

vi.mock("../../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({
    ...mockLLMKeyStatus,
    hasKeys: mockLLMKeyStatus.loading || (mockLLMKeyStatus.data?.hasKeys ?? false),
  }),
}));
vi.mock("../../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children }: any) => <button>{children}</button>,
}));
vi.mock("../AIKeyBanner", () => ({
  default: () => <div data-testid="ai-key-banner" />,
}));
vi.mock("../../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));
vi.mock("../../../Modals/StandardModal", () => ({
  default: ({ isOpen, children }: any) =>
    isOpen ? <div data-testid="standard-modal">{children}</div> : null,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { setShowAlertCallback } from "../../../../../infrastructure/api/customAxios";
import GenerateReport from "../index";

// Observe toasts via the real global alert callback (what showAlert routes to).
let alerts: { variant: string; body: string }[] = [];

describe("GenerateReport", () => {
  beforeEach(() => {
    mockLLMKeyStatus.data = { hasKeys: true, keyCount: 1, providers: ["Anthropic"] };
    mockLLMKeyStatus.loading = false;
    mockReporting.reportRun = { data: undefined };
    mockReporting.mutate.mockReset();
    mockDownload.fn.mockReset().mockResolvedValue(new Blob(["pdf"]));
    // jsdom doesn't implement these on the blob-download path.
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    alerts = [];
    setShowAlertCallback((a) => alerts.push(a as { variant: string; body: string }));
  });

  afterEach(() => setShowAlertCallback(() => {}));

  it("renders without crashing", () => {
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(document.body).toBeTruthy();
  });

  it("does not show the AI key banner while LLM key status is still loading", () => {
    mockLLMKeyStatus.data = null;
    mockLLMKeyStatus.loading = true;
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(screen.queryByTestId("ai-key-banner")).not.toBeInTheDocument();
  });

  it("shows the AI key banner when no key is configured and status is not loading", () => {
    mockLLMKeyStatus.data = { hasKeys: false, keyCount: 0, providers: [] };
    mockLLMKeyStatus.loading = false;
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(screen.getByTestId("ai-key-banner")).toBeInTheDocument();
  });

  // The real bug: a parent re-render with a fresh onClose identity while the
  // download blob-fetch is still in flight must NOT cancel it. Holds the
  // download pending across the re-render, then resolves it.
  it("keeps the in-flight download alive across a re-render and downloads exactly once", async () => {
    let resolveDownload!: (b: Blob) => void;
    mockDownload.fn.mockReturnValue(
      new Promise<Blob>((r) => {
        resolveDownload = r;
      }),
    );
    mockReporting.reportRun = {
      data: {
        id: 5,
        status: "success",
        file_id: 9,
        output_filename: "report.pdf",
        error_message: null,
      },
    };

    const onClose1 = vi.fn();
    const { rerender } = renderWithProviders(
      <GenerateReport onClose={onClose1} reportType="project" />,
    );

    // Effect fired, download requested once — still pending, nothing finalized.
    await waitFor(() => expect(mockDownload.fn).toHaveBeenCalledTimes(1));
    expect(mockDownload.fn).toHaveBeenCalledWith(5);
    expect(onClose1).not.toHaveBeenCalled();

    // Parent re-renders with a FRESH onClose while the download is pending.
    // Same run id/status → effect must NOT re-run and must NOT cancel the fetch.
    const onClose2 = vi.fn();
    rerender(
      <GenerateReport onClose={onClose2} onReportGenerated={vi.fn()} reportType="project" />,
    );

    // Complete the download; it must run to completion using the latest onClose.
    resolveDownload(new Blob(["pdf"]));
    await waitFor(() => expect(onClose2).toHaveBeenCalledTimes(1));

    expect(mockDownload.fn).toHaveBeenCalledTimes(1); // never re-requested
    expect(onClose1).not.toHaveBeenCalled(); // stale callback never used
    expect(alerts).toContainEqual(
      expect.objectContaining({ variant: "success", body: "Report successfully downloaded." }),
    );
  });

  it("shows the error toast and does not download on a failed run", async () => {
    mockReporting.reportRun = {
      data: {
        id: 7,
        status: "failed",
        file_id: null,
        output_filename: null,
        error_message: "boom",
      },
    };

    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);

    await waitFor(() =>
      expect(alerts).toContainEqual(expect.objectContaining({ variant: "error", body: "boom" })),
    );
    expect(mockDownload.fn).not.toHaveBeenCalled();
    // Not stuck on the generating/status view.
    expect(screen.queryByText(/Generating report/i)).not.toBeInTheDocument();
  });
});
