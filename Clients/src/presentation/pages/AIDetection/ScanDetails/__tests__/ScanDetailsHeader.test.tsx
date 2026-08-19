import { render, screen, fireEvent } from "@testing-library/react";
import { ScanDetailsHeader } from "../ScanDetailsHeader";
import type { ScanResponse, Scan } from "../../../../../domain/ai-detection/types";

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 1,
    repository_url: "https://github.com/acme/widgets",
    repository_owner: "acme",
    repository_name: "widgets",
    status: "completed",
    findings_count: 10,
    files_scanned: 100,
    triggered_by: { id: 1, name: "Jane Doe" },
    created_at: "2026-01-01T00:00:00Z",
    duration_ms: 65000,
    risk_score: null,
    risk_score_grade: null,
    risk_score_details: null,
    risk_score_calculated_at: null,
    ...overrides,
  };
}

function makeScanResponse(overrides: Partial<Scan> = {}): ScanResponse {
  return {
    scan: makeScan(overrides),
    summary: { total: 10, by_confidence: { high: 5, medium: 3, low: 2 }, by_provider: {} },
  };
}

describe("ScanDetailsHeader", () => {
  it("renders the repository name and back button", () => {
    const onBack = vi.fn();
    render(
      <ScanDetailsHeader
        scan={makeScanResponse()}
        onBack={onBack}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to history"));
    expect(onBack).toHaveBeenCalled();
  });

  it("formats duration in minutes and seconds", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ duration_ms: 125000 })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("formats duration in milliseconds when under 1 second", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ duration_ms: 500 })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("shows a dash when duration is missing", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ duration_ms: undefined })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("shows a Failed chip and error banner for failed scans", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ status: "failed", error_message: "Clone failed: timeout" })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Scan failed")).toBeInTheDocument();
    expect(screen.getByText("Clone failed: timeout")).toBeInTheDocument();
  });

  it("shows an Incremental chip and changed files count for incremental scans", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ scan_mode: "incremental", changed_files_count: 7 })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("Incremental")).toBeInTheDocument();
    expect(screen.getByText("7 files changed")).toBeInTheDocument();
  });

  it("shows recalculate/export action buttons for completed scans and wires callbacks", () => {
    const onRecalculate = vi.fn();
    const onExport = vi.fn();

    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ status: "completed" })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={onRecalculate}
        isExporting={false}
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByText("Recalculate score"));
    expect(onRecalculate).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Export AI-BOM"));
    expect(onExport).toHaveBeenCalled();
  });

  it("does not show action buttons for non-completed scans", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ status: "scanning" })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.queryByText("Recalculate score")).not.toBeInTheDocument();
    expect(screen.queryByText("Export AI-BOM")).not.toBeInTheDocument();
  });

  it("renders the RiskScoreCard for completed scans with a score", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ status: "completed", risk_score: 90, risk_score_grade: "A" })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("90 / 100")).toBeInTheDocument();
  });

  it("does not render the RiskScoreCard for non-completed scans", () => {
    render(
      <ScanDetailsHeader
        scan={makeScanResponse({ status: "cancelled" })}
        onBack={vi.fn()}
        isRecalculating={false}
        onRecalculate={vi.fn()}
        isExporting={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.queryByText(/No risk score has been calculated/)).not.toBeInTheDocument();
  });
});
