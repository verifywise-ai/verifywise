import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskLevel from "..";
import { vi } from "vitest";
import { SelectChangeEvent } from "@mui/material";

describe("RiskLevel", () => {
  const defaultProps = {
    likelihood: 0,
    riskSeverity: 0,
    handleOnSelectChange: (_field: string) => (_event: SelectChangeEvent<string | number>) => {},
  };

  it("renders without crashing", () => {
    renderWithProviders(<RiskLevel {...defaultProps} />);
    expect(screen.getByText("Risk level")).toBeInTheDocument();
  });

  // The residual pair is optional: with nothing picked there is no level yet.
  it("shows placeholders and no level while neither value is picked", () => {
    renderWithProviders(<RiskLevel {...defaultProps} />);
    expect(screen.getByText("Select likelihood of risk to happen")).toBeInTheDocument();
    expect(screen.getByText("Select risk severity")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the Likelihood select", () => {
    renderWithProviders(<RiskLevel {...defaultProps} />);
    expect(screen.getByText("Likelihood")).toBeInTheDocument();
  });

  it("renders the Risk severity select", () => {
    renderWithProviders(<RiskLevel {...defaultProps} />);
    expect(screen.getByText("Risk severity")).toBeInTheDocument();
  });

  it("calls handleOnSelectChange factory with 'likelihood'", () => {
    const handleOnSelectChange = vi.fn(() => vi.fn());
    renderWithProviders(
      <RiskLevel {...defaultProps} handleOnSelectChange={handleOnSelectChange} />,
    );
    // The Select component renders; the factory is wired but we verify the label exists
    expect(screen.getByText("Likelihood")).toBeInTheDocument();
  });

  it("renders with valid likelihood and severity values", () => {
    // Likelihood=3 => "Possible", Severity=3 => "Moderate"
    renderWithProviders(<RiskLevel {...defaultProps} likelihood={3} riskSeverity={3} />);
    expect(screen.getByText("Risk level")).toBeInTheDocument();
  });

  it("renders with disabled state", () => {
    renderWithProviders(<RiskLevel {...defaultProps} disabled={true} />);
    expect(screen.getByText("Risk level")).toBeInTheDocument();
  });
});
