import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// ArchiveTab is now a thin wrapper around ReportRunsTable — pagination, the
// empty states, and the analyses drawer all live in ReportRunsTable.test.tsx
// (Task 5) and ReportAnalysisPanel.test.tsx now. This only proves the tab
// wires the shared table in "archived" mode.
vi.mock("../ReportRunsTable", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid="runs-table">{variant}</div>,
}));

import ArchiveTab from "../ArchiveTab";

describe("ArchiveTab", () => {
  it("renders the runs table in archived mode", () => {
    renderWithProviders(<ArchiveTab />);
    expect(screen.getByTestId("runs-table")).toHaveTextContent("archived");
  });
});
