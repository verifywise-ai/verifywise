import { vi } from "vitest";

vi.mock("../../../assets/IBMAIRISKDB.json", () => ({
  default: [
    {
      "Id": 1,
      "Summary": "Test Risk",
      "Description": "A test risk",
      "Risk Severity": "Major",
      "Likelihood": "Likely",
      "Risk Category": "Test",
    },
  ],
}));

vi.mock("../../RiskDatabaseModal", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="risk-database-modal">
      <span data-testid="modal-title">{String(props.title)}</span>
      <span data-testid="modal-open">{String(props.isOpen)}</span>
      <span data-testid="database-name">{String(props.databaseName)}</span>
      <span data-testid="risk-count">{String((props.riskData as unknown[]).length)}</span>
    </div>
  ),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskCatalogModal from "../index";

describe("RiskCatalogModal", () => {
  describe("IBM source", () => {
    it("renders RiskDatabaseModal with IBM-specific props", () => {
      renderWithProviders(<RiskCatalogModal source="ibm" isOpen={true} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
      expect(screen.getByTestId("modal-title")).toHaveTextContent(
        "Add a new risk from IBM risk database",
      );
      expect(screen.getByTestId("database-name")).toHaveTextContent("IBM AI Risk Database");
    });

    it("passes isOpen prop to modal", () => {
      renderWithProviders(<RiskCatalogModal source="ibm" isOpen={false} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("modal-open")).toHaveTextContent("false");
    });

    it("renders without onRiskSelected callback", () => {
      renderWithProviders(<RiskCatalogModal source="ibm" isOpen={true} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
    });

    it("renders with data synchronously on first open without fetching", () => {
      global.fetch = vi.fn();
      renderWithProviders(<RiskCatalogModal source="ibm" isOpen={true} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("risk-count")).toHaveTextContent("1");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("MIT source", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mock fetch for lazy loading
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve([]),
      });
    });

    it("renders RiskDatabaseModal with MIT-specific props", async () => {
      renderWithProviders(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
      expect(screen.getByTestId("modal-title")).toHaveTextContent(
        "Add a new risk from risk database",
      );
      expect(screen.getByTestId("database-name")).toHaveTextContent("MIT AI Risk Database");
    });

    it("passes isOpen prop to modal", () => {
      renderWithProviders(<RiskCatalogModal source="mit" isOpen={false} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("modal-open")).toHaveTextContent("false");
    });

    it("renders without onRiskSelected callback", async () => {
      renderWithProviders(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
    });

    it("does not fetch until first open", async () => {
      const { rerender } = renderWithProviders(
        <RiskCatalogModal source="mit" isOpen={false} setIsOpen={vi.fn()} />,
      );
      expect(global.fetch).not.toHaveBeenCalled();

      rerender(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      expect(global.fetch).toHaveBeenCalledWith("/data/MITAIRISKDB.json");
    });

    it("populates data after a successful fetch", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve([
            {
              "Id": 1,
              "Summary": "MIT Risk",
              "Description": "A MIT risk",
              "Risk Severity": "Major",
              "Likelihood": "Likely",
              "Risk Category": "Test",
            },
          ]),
      });
      renderWithProviders(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(screen.getByTestId("risk-count")).toHaveTextContent("1"));
    });

    it("retries fetching on the next open after a failed fetch", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
      const { rerender } = renderWithProviders(
        <RiskCatalogModal source="mit" isOpen={false} setIsOpen={vi.fn()} />,
      );

      rerender(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

      rerender(<RiskCatalogModal source="mit" isOpen={false} setIsOpen={vi.fn()} />);
      rerender(<RiskCatalogModal source="mit" isOpen={true} setIsOpen={vi.fn()} />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
  });
});
