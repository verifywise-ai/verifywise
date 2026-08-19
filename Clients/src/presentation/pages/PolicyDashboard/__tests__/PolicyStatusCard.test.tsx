import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PolicyStatusCard from "../PolicyStatusCard";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";

function buildPolicy(overrides: Partial<PolicyManagerModel> = {}): PolicyManagerModel {
  return {
    id: 1,
    title: "Data Governance Policy",
    content_html: "<p>content</p>",
    status: "Draft",
    tags: [],
    author_id: 1,
    last_updated_by: 1,
    last_updated_at: new Date("2025-01-01"),
    created_at: new Date("2025-01-01"),
    ...overrides,
  } as PolicyManagerModel;
}

describe("PolicyStatusCard", () => {
  const policies = [
    buildPolicy({ id: 1, status: "Draft" }),
    buildPolicy({ id: 2, status: "Draft" }),
    buildPolicy({ id: 3, status: "Approved" }),
    buildPolicy({ id: 4, status: "Published" }),
    buildPolicy({ id: 5, status: "Archived" }),
    buildPolicy({ id: 6, status: "Deprecated" }),
    buildPolicy({ id: 7, status: "Under Review" }),
  ];

  it("renders a total card with the overall policy count", () => {
    renderWithProviders(<PolicyStatusCard policies={policies} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders a card per status with the correct counts", () => {
    renderWithProviders(<PolicyStatusCard policies={policies} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Deprecated")).toBeInTheDocument();
    // Two policies are Draft
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });

  it("renders zero counts when there are no policies", () => {
    renderWithProviders(<PolicyStatusCard policies={[]} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("calls onCardClick with the status key when a status card is clicked", () => {
    const onCardClick = vi.fn();
    renderWithProviders(
      <PolicyStatusCard policies={policies} onCardClick={onCardClick} selectedStatus={null} />,
    );
    fireEvent.click(screen.getByText("Approved"));
    expect(onCardClick).toHaveBeenCalledWith("Approved");
  });

  it("clears the filter when the Total card is clicked", () => {
    const onCardClick = vi.fn();
    renderWithProviders(
      <PolicyStatusCard policies={policies} onCardClick={onCardClick} selectedStatus="Draft" />,
    );
    fireEvent.click(screen.getByText("Total"));
    expect(onCardClick).toHaveBeenCalledWith("");
  });

  it("clears the filter when clicking the already-selected status card again", () => {
    const onCardClick = vi.fn();
    renderWithProviders(
      <PolicyStatusCard policies={policies} onCardClick={onCardClick} selectedStatus="Draft" />,
    );
    fireEvent.click(screen.getByText("Draft"));
    expect(onCardClick).toHaveBeenCalledWith("");
  });

  it("does not throw when onCardClick is not provided", () => {
    renderWithProviders(<PolicyStatusCard policies={policies} />);
    expect(() => fireEvent.click(screen.getByText("Approved"))).not.toThrow();
  });
});
