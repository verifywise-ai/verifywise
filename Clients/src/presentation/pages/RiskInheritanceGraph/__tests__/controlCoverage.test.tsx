import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import userEvent from "@testing-library/user-event";
import { projectsText, listHeading } from "../ControlCoverage";
import type { CoverageGapRisk, CoverageReport } from "../../../../domain/interfaces/i.riskLink";

const mockGetControlCoverage = vi.fn();

vi.mock("../../../../application/repository/riskLink.repository", () => ({
  getControlCoverage: (...args: unknown[]) => mockGetControlCoverage(...args),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@x.io", roleId: 1 }],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

import ControlCoverage from "../ControlCoverage";

describe("control coverage helpers", () => {
  const projects = [
    { id: 1, name: "Claims triage", has_framework: true },
    { id: 2, name: "Internal chatbot", has_framework: false },
  ];

  it("names the project without a framework only where the mix explains the finding", () => {
    expect(projectsText(projects, true)).toBe("Claims triage, Internal chatbot (no framework)");
    // In the no-framework list every row lacks one; repeating it is noise.
    expect(projectsText(projects, false)).toBe("Claims triage, Internal chatbot");
  });

  it("renders a dash rather than a blank cell for a risk in no project", () => {
    expect(projectsText([], true)).toBe("—");
  });

  it("admits the list is capped, and stays quiet when it is not", () => {
    expect(listHeading("Coverage gaps", 500, 1203)).toBe("Coverage gaps (500 of 1,203)");
    expect(listHeading("Coverage gaps", 4, 4)).toBe("Coverage gaps (4)");
  });
});

describe("ControlCoverage rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const risk = (overrides: Partial<CoverageGapRisk> = {}): CoverageGapRisk => ({
    id: 11,
    risk_name: "Unreviewed training data",
    risk_owner: 7,
    risk_level: "High risk",
    mitigation_status: "Not started",
    projects: [{ id: 1, name: "Claims triage", has_framework: true }],
    assessment_link_count: 0,
    ...overrides,
  });

  const report = (overrides: Partial<CoverageReport> = {}): CoverageReport => ({
    summary: { total_active_risks: 3, covered: 2, gap: 1, no_framework: 0 },
    gaps: [risk()],
    no_framework: [],
    truncated: false,
    ...overrides,
  });

  const expand = async () => {
    renderWithProviders(<ControlCoverage />);
    await userEvent.click(await screen.findByText("Control coverage"));
  };

  it("shows the four state counts and the gap row with its owner", async () => {
    mockGetControlCoverage.mockResolvedValue(report());
    await expand();

    expect(await screen.findByText("Coverage gaps (1)")).toBeInTheDocument();
    expect(screen.getByText("Unreviewed training data")).toBeInTheDocument();
    expect(screen.getByText(/#11 · Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText("Active risks")).toBeInTheDocument();
    expect(screen.getByText("Covered by a control")).toBeInTheDocument();
    expect(screen.getByText("No framework yet")).toBeInTheDocument();
  });

  it("keeps a risk with assessment links in the gaps list — they are not coverage", async () => {
    mockGetControlCoverage.mockResolvedValue(
      report({ gaps: [risk({ assessment_link_count: 4 })] }),
    );
    await expand();

    const heading = await screen.findByText("Coverage gaps (1)");
    expect(heading).toBeInTheDocument();
    const row = screen.getByText("Unreviewed training data").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("4")).toBeInTheDocument();
  });

  it("keeps the two states in separate tables with their own framing", async () => {
    mockGetControlCoverage.mockResolvedValue(
      report({
        summary: { total_active_risks: 4, covered: 2, gap: 1, no_framework: 1 },
        no_framework: [
          risk({
            id: 22,
            risk_name: "Vendor model unvetted",
            projects: [{ id: 2, name: "Internal chatbot", has_framework: false }],
          }),
        ],
      }),
    );
    await expand();

    expect(await screen.findByText("Coverage gaps (1)")).toBeInTheDocument();
    expect(screen.getByText("No framework yet (1)")).toBeInTheDocument();
    expect(screen.getByText(/Not a finding/)).toBeInTheDocument();
  });

  it("treats full coverage as a result, not an empty report", async () => {
    mockGetControlCoverage.mockResolvedValue(
      report({
        summary: { total_active_risks: 3, covered: 3, gap: 0, no_framework: 0 },
        gaps: [],
      }),
    );
    await expand();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Every active risk is linked to at least one control.",
    );
  });

  it("shows the empty state only when there is nothing to check", async () => {
    mockGetControlCoverage.mockResolvedValue(
      report({
        summary: { total_active_risks: 0, covered: 0, gap: 0, no_framework: 0 },
        gaps: [],
      }),
    );
    await expand();

    expect(await screen.findByText(/No active risks to check/)).toBeInTheDocument();
  });

  it("surfaces a failed fetch instead of an empty table", async () => {
    mockGetControlCoverage.mockRejectedValue(new Error("boom"));
    await expand();

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
