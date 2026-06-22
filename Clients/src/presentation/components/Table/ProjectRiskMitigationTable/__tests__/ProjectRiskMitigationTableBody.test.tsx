import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ProjectRiskMitigationTableBody } from "../ProjectRiskMitigationTableBody";
import type { ProjectRiskMitigation } from "../../../../../domain/types/ProjectRisk";

const mockRows: ProjectRiskMitigation[] = [
  {
    id: 1,
    type: "annexcategory",
    title: "Data Privacy Controls",
    parent_id: 10,
    meta_id: 100,
    sup_id: 1,
    sub_id: 1,
    project_id: 5,
  } as unknown as ProjectRiskMitigation,
  {
    id: 2,
    type: "subclause",
    title: "Model Documentation Requirements",
    parent_id: 20,
    meta_id: 200,
    sup_id: 2,
    sub_id: 3,
    project_id: 5,
  } as unknown as ProjectRiskMitigation,
  {
    id: 3,
    type: "assessment",
    title: "Bias Assessment Procedure",
    parent_id: 30,
    meta_id: 300,
    sup_id: 1,
    sub_id: 0,
    project_id: 5,
  } as unknown as ProjectRiskMitigation,
  {
    id: 4,
    type: "control",
    title: "EU AI Act Risk Control Implementation",
    sup_id: 1,
    sub_id: 2,
    project_id: 5,
  } as unknown as ProjectRiskMitigation,
  {
    id: 5,
    type: "annexcontrol_27001",
    title: "Information Security Policy",
    parent_id: 50,
    meta_id: 500,
    sup_id: 5,
    sub_id: 1,
    project_id: 5,
  } as unknown as ProjectRiskMitigation,
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  setCurrentPagingation: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Mock window.open
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("ProjectRiskMitigationTableBody", () => {
  it("renders all rows", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText(/Data Privacy Controls/)).toBeInTheDocument();
    expect(screen.getByText(/Model Documentation Requirements/)).toBeInTheDocument();
    expect(screen.getByText(/Bias Assessment Procedure/)).toBeInTheDocument();
  });

  it("renders annex category type label", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("ISO42001: Annex Category")).toBeInTheDocument();
  });

  it("renders subclause type label", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("ISO42001: Sub-Clause")).toBeInTheDocument();
  });

  it("renders assessment type label", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("EU-AI-Act: Control")).toBeInTheDocument();
  });

  it("renders control type label", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("EU-AI-Act: Requirement")).toBeInTheDocument();
  });

  it("renders ISO27001 annex control type label", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("ISO27001: Annex Control")).toBeInTheDocument();
  });

  it("formats title with prefix for annexcategory", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText(/A\.1\.1 Data Privacy Controls/)).toBeInTheDocument();
  });

  it("formats title without prefix for assessment", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Bias Assessment Procedure")).toBeInTheDocument();
  });

  it("renders View button for each row", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    const viewButtons = screen.getAllByText("View");
    expect(viewButtons.length).toBe(mockRows.length);
  });

  it("opens new tab on View click for annexcategory", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[0]);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/framework?framework=iso-42001&annexId=10&annexCategoryId=100"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens new tab on View click for subclause", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[1]);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/framework?framework=iso-42001&clauseId=20&subClauseId=200"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("renders pagination", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });

  it("truncates long titles to 50 chars", () => {
    const longTitleRow = [
      {
        ...mockRows[0],
        id: 99,
        title:
          "A very long title that definitely exceeds fifty characters and should be truncated at fifty characters exactly",
      } as unknown as ProjectRiskMitigation,
    ];
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} rows={longTitleRow} />
      </table>,
    );
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument();
  });

  it("calls setCurrentPagingation on page change", async () => {
    const setCurrentPagingation = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody
          {...defaultProps}
          setCurrentPagingation={setCurrentPagingation}
        />
      </table>,
    );
    const nextButton = document.querySelector('[aria-label="Go to next page"]');
    if (nextButton) {
      await user.click(nextButton);
      expect(setCurrentPagingation).toHaveBeenCalledWith(1);
    }
  });

  it("renders with empty rows", () => {
    renderWithProviders(
      <table>
        <ProjectRiskMitigationTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });
});
