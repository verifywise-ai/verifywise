import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import QuantitativeRiskForm, { quantitativeInitialState } from "..";
import { vi } from "vitest";

// Mock hooks that make API calls
vi.mock("../../../../application/hooks/useQuantitativeRisk", () => ({
  useBenchmarks: () => ({ benchmarks: [], isLoading: false }),
}));

describe("QuantitativeRiskForm", () => {
  const defaultProps = {
    values: { ...quantitativeInitialState },
    onChange: vi.fn(),
    disabled: false,
  };

  it("renders without crashing", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(screen.getByText("Event Frequency (annualized)")).toBeInTheDocument();
  });

  it("renders the loss magnitude section", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(screen.getByText("Loss Magnitude ($)")).toBeInTheDocument();
  });

  it("renders all four loss category rows", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(screen.getByText("Regulatory fines")).toBeInTheDocument();
    expect(screen.getByText("Operational costs")).toBeInTheDocument();
    expect(screen.getByText("Litigation costs")).toBeInTheDocument();
    expect(screen.getByText("Reputational damage")).toBeInTheDocument();
  });

  it("renders the ALE empty-state message when no data is entered", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(
      screen.getByText("Enter frequency and loss values to see the ALE calculation"),
    ).toBeInTheDocument();
  });

  it("renders the benchmark selector section", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(screen.getByText("Start from industry benchmark")).toBeInTheDocument();
  });

  it("renders frequency three-point inputs", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} />);
    expect(screen.getByText("Frequency (times per year)")).toBeInTheDocument();
    // Three-point rows have Min, Most likely, Max labels (multiple rows)
    expect(screen.getAllByText("Min").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Most likely").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Max").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onChange when a field value changes", async () => {
    const onChange = vi.fn();
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} onChange={onChange} />);
    const minInputs = screen.getAllByPlaceholderText("0.0");
    // Type into the first min input (event_frequency_min)
    await userEvent.type(minInputs[0], "5");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders with disabled state", () => {
    renderWithProviders(<QuantitativeRiskForm {...defaultProps} disabled={true} />);
    expect(screen.getByText("Event Frequency (annualized)")).toBeInTheDocument();
  });
});
