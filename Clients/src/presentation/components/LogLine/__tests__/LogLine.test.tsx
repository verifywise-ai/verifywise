import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { LogLine } from "../index";

describe("LogLine", () => {
  it("renders the line number (1-indexed)", () => {
    renderWithProviders(<LogLine line="Starting server..." index={0} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders the log text", () => {
    renderWithProviders(<LogLine line="Starting server..." index={0} />);
    expect(screen.getByText("Starting server...")).toBeInTheDocument();
  });

  it("renders correct line number for non-zero index", () => {
    renderWithProviders(<LogLine line="Second line" index={4} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("applies error styling for lines containing 'error'", () => {
    renderWithProviders(<LogLine line="Error: connection refused" index={0} />);
    const logText = screen.getByText("Error: connection refused");
    expect(logText).toBeInTheDocument();
    // Error lines get fontWeight 600
    expect(logText).toHaveStyle({ fontWeight: 600 });
  });

  it("applies warn styling for lines containing 'warn'", () => {
    renderWithProviders(<LogLine line="Warning: deprecated API" index={0} />);
    const logText = screen.getByText("Warning: deprecated API");
    expect(logText).toBeInTheDocument();
    expect(logText).toHaveStyle({ fontWeight: 500 });
  });

  it("renders plain lines without special styling", () => {
    renderWithProviders(<LogLine line="Just a regular log" index={0} />);
    const logText = screen.getByText("Just a regular log");
    expect(logText).toBeInTheDocument();
    expect(logText).toHaveStyle({ fontWeight: 400 });
  });

  it("applies success styling for lines containing 'success'", () => {
    renderWithProviders(<LogLine line="Operation successful" index={0} />);
    const logText = screen.getByText("Operation successful");
    expect(logText).toBeInTheDocument();
    expect(logText).toHaveStyle({ fontWeight: 400, color: "#388e3c" });
  });

  it("applies info styling for lines containing 'info'", () => {
    renderWithProviders(<LogLine line="[INFO] Server started" index={0} />);
    const logText = screen.getByText("[INFO] Server started");
    expect(logText).toBeInTheDocument();
    expect(logText).toHaveStyle({ color: "#1976d2" });
  });
});
