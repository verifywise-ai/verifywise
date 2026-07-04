import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import WeakControlsList from "../index";

vi.mock("../../Chip", () => ({
  default: ({ label }: { label: string }) => <span data-testid="chip">{label}</span>,
}));

const mockControls = [
  {
    control_id: 1,
    framework_type: "eu_ai_act",
    overall_score: 25,
    readiness_level: "critical",
    priority: "critical",
    recommendations: ["Implement documentation process", "Set up monitoring"],
  },
  {
    control_id: 2,
    framework_type: "iso_42001",
    overall_score: 45,
    readiness_level: "high",
    priority: "high",
    recommendations: ["Review data handling"],
  },
  {
    control_id: 3,
    framework_type: "nist_ai_rmf",
    overall_score: 65,
    readiness_level: "medium",
    priority: "medium",
    recommendations: [],
  },
];

describe("WeakControlsList", () => {
  it("renders loading state", () => {
    renderWithProviders(<WeakControlsList controls={[]} isLoading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state when controls is empty", () => {
    renderWithProviders(<WeakControlsList controls={[]} />);
    expect(
      screen.getByText("No weak controls found. Your compliance posture looks strong!"),
    ).toBeInTheDocument();
  });

  it("renders empty state when controls is null", () => {
    renderWithProviders(<WeakControlsList controls={null as unknown as []} />);
    expect(
      screen.getByText("No weak controls found. Your compliance posture looks strong!"),
    ).toBeInTheDocument();
  });

  it("renders control details", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    expect(screen.getByText("Weakest controls")).toBeInTheDocument();
    expect(screen.getByText("Control #1")).toBeInTheDocument();
    expect(screen.getByText("Control #2")).toBeInTheDocument();
    expect(screen.getByText("Control #3")).toBeInTheDocument();
  });

  it("shows framework names for known types", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
  });

  it("renders priority labels based on score", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText(/^High$/)).toBeInTheDocument();
    expect(screen.getByText(/^Medium$/)).toBeInTheDocument();
  });

  it("shows overall scores", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
  });

  it("renders recommendations when present", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    expect(screen.getByText("Implement documentation process")).toBeInTheDocument();
    expect(screen.getByText("Set up monitoring")).toBeInTheDocument();
    expect(screen.getByText("Review data handling")).toBeInTheDocument();
  });

  it("does not render recommendations section when empty", () => {
    renderWithProviders(<WeakControlsList controls={[mockControls[2]]} />);
    expect(screen.queryByText("Implement documentation process")).not.toBeInTheDocument();
  });

  it("respects maxItems limit", () => {
    const manyControls = Array.from({ length: 15 }, (_, i) => ({
      control_id: i + 1,
      framework_type: "eu_ai_act",
      overall_score: 20 + i,
      readiness_level: "critical",
      recommendations: [],
    }));
    renderWithProviders(<WeakControlsList controls={manyControls} maxItems={3} />);
    expect(screen.getByText("Control #1")).toBeInTheDocument();
    expect(screen.getByText("Control #3")).toBeInTheDocument();
    expect(screen.queryByText("Control #4")).not.toBeInTheDocument();
  });

  it("renders with default maxItems of 10", () => {
    const manyControls = Array.from({ length: 12 }, (_, i) => ({
      control_id: i + 1,
      framework_type: "eu_ai_act",
      overall_score: 20,
      readiness_level: "critical",
      recommendations: [],
    }));
    renderWithProviders(<WeakControlsList controls={manyControls} />);
    expect(screen.getByText("Control #10")).toBeInTheDocument();
    expect(screen.queryByText("Control #11")).not.toBeInTheDocument();
  });

  it("scores <30 get Critical priority", () => {
    renderWithProviders(<WeakControlsList controls={[mockControls[0]]} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("scores 30-59 get High priority", () => {
    renderWithProviders(<WeakControlsList controls={[mockControls[1]]} />);
    expect(screen.getByText(/^High$/)).toBeInTheDocument();
  });

  it("scores >=60 get Medium priority", () => {
    renderWithProviders(<WeakControlsList controls={[mockControls[2]]} />);
    expect(screen.getByText(/^Medium$/)).toBeInTheDocument();
  });

  it("formats unknown framework type", () => {
    const ctrl = { ...mockControls[0], framework_type: "custom_framework" };
    renderWithProviders(<WeakControlsList controls={[ctrl]} />);
    expect(screen.getByText("CUSTOM FRAMEWORK")).toBeInTheDocument();
  });

  it("renders priority chip via Chip component", () => {
    renderWithProviders(<WeakControlsList controls={mockControls} />);
    const chips = screen.getAllByTestId("chip");
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });
});
