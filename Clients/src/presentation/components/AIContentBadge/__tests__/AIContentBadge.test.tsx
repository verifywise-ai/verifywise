import { screen, render } from "@testing-library/react";
import AIContentBadge from "../index";

vi.mock("../../Chip", () => ({
  default: ({ label }: { label: string }) => <span data-testid="chip">{label}</span>,
}));

describe("AIContentBadge", () => {
  it("renders inline variant with generated badge", () => {
    render(<AIContentBadge badgeType="generated" />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
  });

  it("renders inline variant with assisted badge", () => {
    render(<AIContentBadge badgeType="assisted" />);
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("renders inline variant with reviewed badge", () => {
    render(<AIContentBadge badgeType="reviewed" />);
    expect(screen.getByText("AI-reviewed")).toBeInTheDocument();
  });

  it("renders inline variant with suggested badge", () => {
    render(<AIContentBadge badgeType="suggested" />);
    expect(screen.getByText("AI-suggested")).toBeInTheDocument();
  });

  it("shows reviewed dot when humanReviewed is true", () => {
    render(<AIContentBadge badgeType="generated" humanReviewed />);
    const container = screen.getByText("AI-generated").closest("div");
    expect(container?.querySelector("div div")).toBeInTheDocument();
  });

  it("does not show dot when humanReviewed is false", () => {
    const { container } = render(<AIContentBadge badgeType="generated" humanReviewed={false} />);
    expect(container.querySelector("div[style*='border-radius: 50%']")).not.toBeInTheDocument();
  });

  it("renders card variant with model and confidence", () => {
    render(
      <AIContentBadge
        badgeType="generated"
        variant="card"
        modelUsed="GPT-4"
        confidenceScore={85}
      />,
    );
    expect(screen.getByText("Model: GPT-4")).toBeInTheDocument();
    expect(screen.getByText("Confidence: 85%")).toBeInTheDocument();
  });

  it("renders card variant with pending review text when not reviewed", () => {
    render(<AIContentBadge badgeType="generated" variant="card" humanReviewed={false} />);
    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });

  it("renders card variant with review action chip when reviewed", () => {
    render(
      <AIContentBadge badgeType="generated" variant="card" humanReviewed reviewAction="approved" />,
    );
    expect(screen.getByTestId("chip")).toHaveTextContent("Approved");
  });

  it("renders card variant with modified chip", () => {
    render(
      <AIContentBadge badgeType="generated" variant="card" humanReviewed reviewAction="modified" />,
    );
    expect(screen.getByTestId("chip")).toHaveTextContent("Modified");
  });

  it("renders card variant with rejected chip", () => {
    render(
      <AIContentBadge badgeType="generated" variant="card" humanReviewed reviewAction="rejected" />,
    );
    expect(screen.getByTestId("chip")).toHaveTextContent("Rejected");
  });

  it("renders tooltip variant with CustomChip", () => {
    render(<AIContentBadge badgeType="generated" variant="tooltip" />);
    expect(screen.getByTestId("chip")).toHaveTextContent("AI-generated");
  });

  it("renders tooltip variant with medium size", () => {
    render(<AIContentBadge badgeType="generated" variant="tooltip" size="medium" />);
    expect(screen.getByTestId("chip")).toHaveTextContent("AI-generated");
  });

  it("renders inline variant with medium size", () => {
    const { container } = render(<AIContentBadge badgeType="generated" size="medium" />);
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("includes model info in tooltip", () => {
    render(<AIContentBadge badgeType="generated" modelUsed="Claude" />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
  });

  it("includes review info in tooltip when humanReviewed with action", () => {
    render(<AIContentBadge badgeType="generated" humanReviewed reviewAction="approved" />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
  });

  it("includes not reviewed in tooltip when humanReviewed is false", () => {
    render(<AIContentBadge badgeType="generated" humanReviewed={false} />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
  });
});
