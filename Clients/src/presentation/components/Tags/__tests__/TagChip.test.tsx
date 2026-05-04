import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TagChip from "../TagChip";

describe("TagChip", () => {
  it("renders the tag text", () => {
    renderWithProviders(<TagChip tag="AI Ethics" />);
    expect(screen.getByText("AI Ethics")).toBeInTheDocument();
  });

  it("renders tag text with uppercase text-transform", () => {
    renderWithProviders(<TagChip tag="privacy" />);
    const chip = screen.getByText("privacy");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle({ textTransform: "uppercase" });
  });

  it("renders a known tag with specific styling", () => {
    renderWithProviders(<TagChip tag="transparency" />);
    const chip = screen.getByText("transparency");
    expect(chip).toBeInTheDocument();
  });

  it("renders an unknown tag with default styling", () => {
    renderWithProviders(<TagChip tag="custom-tag" />);
    const chip = screen.getByText("custom-tag");
    expect(chip).toBeInTheDocument();
  });

  it("renders as an inline-block span", () => {
    renderWithProviders(<TagChip tag="fairness" />);
    const chip = screen.getByText("fairness");
    expect(chip).toHaveStyle({ display: "inline-block" });
  });

  it("applies correct font size and weight", () => {
    renderWithProviders(<TagChip tag="security" />);
    const chip = screen.getByText("security");
    expect(chip).toHaveStyle({ fontWeight: 500, fontSize: "11px" });
  });
});
