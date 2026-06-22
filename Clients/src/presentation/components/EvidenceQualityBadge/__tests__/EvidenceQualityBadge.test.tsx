import { screen, fireEvent } from "@testing-library/react";
import { render } from "@testing-library/react";
import EvidenceQualityBadge from "../index";

describe("EvidenceQualityBadge", () => {
  it("renders score number", () => {
    render(<EvidenceQualityBadge score={85} />);
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("shows label for high score (>=80)", () => {
    render(<EvidenceQualityBadge score={85} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("shows label for good score (>=60)", () => {
    render(<EvidenceQualityBadge score={72} />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows label for fair score (>=40)", () => {
    render(<EvidenceQualityBadge score={55} />);
    expect(screen.getByText("Fair")).toBeInTheDocument();
  });

  it("shows label for low score (<40)", () => {
    render(<EvidenceQualityBadge score={25} />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(<EvidenceQualityBadge score={85} showLabel={false} />);
    expect(screen.queryByText("High")).not.toBeInTheDocument();
  });

  it("calls onClick handler when clicked", () => {
    const onClick = vi.fn();
    render(<EvidenceQualityBadge score={85} onClick={onClick} />);
    fireEvent.click(screen.getByText("85"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders with medium size", () => {
    render(<EvidenceQualityBadge score={85} size="medium" />);
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("uses correct tooltip for clickable badge", () => {
    const onClick = vi.fn();
    render(<EvidenceQualityBadge score={72} onClick={onClick} />);
    fireEvent.click(screen.getByText("72"));
    expect(onClick).toHaveBeenCalled();
  });
});
