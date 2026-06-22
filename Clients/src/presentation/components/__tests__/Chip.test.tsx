import { screen, render } from "@testing-library/react";
import Chip, { VARIANT_COLORS, getChipColors } from "../Chip";
import { ThemeProvider, createTheme } from "@mui/material";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe("Chip", () => {
  it("renders the label text", () => {
    renderWithTheme(<Chip label="High" variant="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders uppercase by default", () => {
    renderWithTheme(<Chip label="critical" variant="critical" />);
    const chip = screen.getByText("critical");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle("text-transform: uppercase");
  });

  it("renders lowercase when uppercase=false", () => {
    renderWithTheme(<Chip label="In Progress" variant="warning" uppercase={false} />);
    const chip = screen.getByText("In Progress");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle("text-transform: none");
  });

  it("renders with medium size", () => {
    renderWithTheme(<Chip label="Approved" variant="success" size="medium" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    renderWithTheme(
      <Chip label="Yes" variant="yes" icon={<span data-testid="chip-icon">✓</span>} />,
    );
    expect(screen.getByTestId("chip-icon")).toBeInTheDocument();
  });

  it("uses custom background and text colors", () => {
    renderWithTheme(<Chip label="Custom" backgroundColor="#E8F5E9" textColor="#2E7D32" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("derives variant from label when no variant given", () => {
    renderWithTheme(<Chip label="approved" />);
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("falls back to default variant for unknown labels", () => {
    renderWithTheme(<Chip label="some-unknown-label-xyz" />);
    expect(screen.getByText("some-unknown-label-xyz")).toBeInTheDocument();
  });
});

describe("getChipColors", () => {
  it("returns custom colors when both backgroundColor and textColor provided", () => {
    const result = getChipColors("test", undefined, "#111", "#222");
    expect(result).toEqual({ backgroundColor: "#111", textColor: "#222" });
  });

  it("returns variant colors when variant is valid", () => {
    const result = getChipColors("test", "success");
    expect(result.backgroundColor).toBeTruthy();
    expect(result.textColor).toBeTruthy();
  });

  it("derives variant from label when no variant given", () => {
    const result = getChipColors("approved");
    expect(result).toEqual(VARIANT_COLORS.success);
  });

  it("returns default colors for unknown label without variant", () => {
    const result = getChipColors("nonexistent_label");
    expect(result).toEqual(VARIANT_COLORS.default);
  });
});

describe("VARIANT_COLORS", () => {
  it("has all required risk level variants", () => {
    const required = ["critical", "high", "medium", "low", "very-low"];
    for (const key of required) {
      expect(VARIANT_COLORS[key as keyof typeof VARIANT_COLORS]).toBeDefined();
      expect(VARIANT_COLORS[key as keyof typeof VARIANT_COLORS].backgroundColor).toBeTruthy();
      expect(VARIANT_COLORS[key as keyof typeof VARIANT_COLORS].textColor).toBeTruthy();
    }
  });

  it("has all required status variants", () => {
    const required = ["success", "warning", "error", "info", "default"];
    for (const key of required) {
      expect(VARIANT_COLORS[key as keyof typeof VARIANT_COLORS]).toBeDefined();
    }
  });
});
