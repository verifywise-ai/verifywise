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
import GenerateReport from "../index";

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
  });

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

  // Drives the terminal-run effect directly: a successful run must download
  // exactly once, even when the effect re-runs with the same run.data because
  // the parent handed down fresh onClose/onReportGenerated identities.
  it("downloads a successful run exactly once despite re-renders", async () => {
    mockReporting.reportRun = {
      data: {
        id: 5,
        status: "success",
        file_id: 9,
        output_filename: "report.pdf",
        error_message: null,
      },
    };
    const { rerender } = renderWithProviders(
      <GenerateReport onClose={vi.fn()} reportType="project" />,
    );

    await waitFor(() => expect(mockDownload.fn).toHaveBeenCalledTimes(1));
    expect(mockDownload.fn).toHaveBeenCalledWith(5);

    // Re-render with new callback identities → effect deps change, same run.data.
    rerender(<GenerateReport onClose={vi.fn()} onReportGenerated={vi.fn()} reportType="project" />);
    await Promise.resolve();

    expect(mockDownload.fn).toHaveBeenCalledTimes(1);
  });
});
