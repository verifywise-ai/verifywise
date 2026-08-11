import { screen, fireEvent } from "@testing-library/react";
import { render } from "@testing-library/react";
import EvidenceQualityBadge from "../index";

describe("EvidenceQualityBadge", () => {
  it("renders grade letter", () => {
    render(<EvidenceQualityBadge grade="A" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows label for grade A (Excellent)", () => {
    render(<EvidenceQualityBadge grade="A" />);
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("shows label for grade B (Good)", () => {
    render(<EvidenceQualityBadge grade="B" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows label for grade C (Adequate)", () => {
    render(<EvidenceQualityBadge grade="C" />);
    expect(screen.getByText("Adequate")).toBeInTheDocument();
  });

  it("shows label for grade F (Insufficient)", () => {
    render(<EvidenceQualityBadge grade="F" />);
    expect(screen.getByText("Insufficient")).toBeInTheDocument();
  });

  it("renders unrated when grade is null", () => {
    render(<EvidenceQualityBadge grade={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Unrated")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(<EvidenceQualityBadge grade="A" showLabel={false} />);
    expect(screen.queryByText("Excellent")).not.toBeInTheDocument();
  });

  it("calls onClick handler when clicked", () => {
    const onClick = vi.fn();
    render(<EvidenceQualityBadge grade="A" onClick={onClick} />);
    fireEvent.click(screen.getByText("A"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders with medium size", () => {
    render(<EvidenceQualityBadge grade="A" size="medium" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("uses correct tooltip for clickable badge", () => {
    const onClick = vi.fn();
    render(<EvidenceQualityBadge grade="C" onClick={onClick} />);
    fireEvent.click(screen.getByText("C"));
    expect(onClick).toHaveBeenCalled();
  });
});
