import { screen, render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import StatusBadge, { VARIANT_COLORS, VARIANT_GROUPS, getChipColors } from "../index";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe("StatusBadge", () => {
  it("renders the label text", () => {
    renderWithTheme(<StatusBadge label="High" variant="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders uppercase by default", () => {
    renderWithTheme(<StatusBadge label="critical" variant="critical" />);
    const badge = screen.getByText("critical");
    expect(badge).toHaveStyle("text-transform: uppercase");
  });

  it("renders sentence case when uppercase is false", () => {
    renderWithTheme(<StatusBadge label="In Progress" variant="warning" uppercase={false} />);
    const badge = screen.getByText("In Progress");
    expect(badge).toHaveStyle("text-transform: none");
  });

  it("renders small and medium sizes", () => {
    const { unmount } = renderWithTheme(<StatusBadge label="Small" variant="info" size="small" />);
    expect(screen.getByText("Small")).toHaveStyle("height: 24px");
    unmount();

    renderWithTheme(<StatusBadge label="Medium" variant="info" size="medium" />);
    expect(screen.getByText("Medium")).toHaveStyle("height: 34px");
  });

  it("renders an icon when provided", () => {
    renderWithTheme(
      <StatusBadge label="Yes" variant="yes" icon={<span data-testid="badge-icon">✓</span>} />,
    );
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
  });

  it("derives the variant from the label when none is given", () => {
    renderWithTheme(<StatusBadge label="approved" />);
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("does not throw when the label is null", () => {
    expect(() => renderWithTheme(<StatusBadge label={null as unknown as string} />)).not.toThrow();
  });

  it("covers risk, status, severity, and boolean variant groups", () => {
    const groups = Object.keys(VARIANT_GROUPS) as Array<keyof typeof VARIANT_GROUPS>;
    expect(groups).toEqual(["risk", "status", "severity", "boolean"]);
    for (const group of groups) {
      for (const variant of VARIANT_GROUPS[group]) {
        expect(VARIANT_COLORS[variant]).toBeDefined();
      }
    }
  });
});

describe("getChipColors", () => {
  it("returns custom colors when both backgroundColor and textColor are provided", () => {
    const result = getChipColors("test", undefined, "#111", "#222");
    expect(result).toEqual({ backgroundColor: "#111", textColor: "#222" });
  });

  it("derives the variant from the label when no variant is given", () => {
    const result = getChipColors("approved");
    expect(result).toEqual(VARIANT_COLORS.success);
  });

  it("returns default colors for an unknown label", () => {
    const result = getChipColors("nonexistent_label");
    expect(result).toEqual(VARIANT_COLORS.default);
  });
});
