import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Result from "./Result";

describe("Result", () => {
  it("renders the prohibited classification", () => {
    renderWithProviders(<Result classification={{ level: "PROHIBITED" }} answers={{}} />);
    expect(screen.getByText("Prohibited AI system")).toBeInTheDocument();
  });

  it("renders the high-risk classification", () => {
    renderWithProviders(<Result classification={{ level: "HIGH_RISK" }} answers={{}} />);
    expect(screen.getByText("High-Risk AI system")).toBeInTheDocument();
  });

  it("renders the limited-risk classification", () => {
    renderWithProviders(<Result classification={{ level: "LIMITED_RISK" }} answers={{}} />);
    expect(screen.getByText("Limited risk")).toBeInTheDocument();
  });

  it("renders the minimal-risk classification", () => {
    renderWithProviders(<Result classification={{ level: "MINIMAL_RISK" }} answers={{}} />);
    expect(screen.getByText("Minimal risk")).toBeInTheDocument();
  });

  it("renders a pending/default state for unrecognized levels", () => {
    renderWithProviders(<Result classification={{ level: "PENDING" }} answers={{}} />);
    expect(screen.getByText("Assessment pending")).toBeInTheDocument();
  });

  it("does not render action buttons when no callbacks are passed", () => {
    renderWithProviders(<Result classification={{ level: "MINIMAL_RISK" }} answers={{}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onRestart when 'Start new assessment' is clicked", () => {
    const onRestart = vi.fn();
    renderWithProviders(
      <Result classification={{ level: "MINIMAL_RISK" }} answers={{}} onRestart={onRestart} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start new assessment/i }));
    expect(onRestart).toHaveBeenCalled();
  });

  it("calls onSave when 'Save results' is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <Result classification={{ level: "MINIMAL_RISK" }} answers={{}} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save results/i }));
    expect(onSave).toHaveBeenCalled();
  });
});
