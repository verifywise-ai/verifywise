import { vi } from "vitest";

vi.mock("../../Charts/ModelInventoryHistoryChart", () => ({
  ModelInventoryHistoryChart: () => <div data-testid="model-chart" />,
}));

vi.mock("../../Charts/RiskHistoryChart", () => ({
  RiskHistoryChart: () => <div data-testid="risk-chart" />,
}));

vi.mock("../../button-toggle", () => ({
  ButtonToggle: ({ options }: any) => (
    <div data-testid="button-toggle">
      {options?.map((o: any) => (
        <span key={o.value}>{o.label}</span>
      ))}
    </div>
  ),
}));

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AnalyticsDrawer from "../index";

describe("AnalyticsDrawer", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: "Analytics & Trends",
    description: "Track history over time",
    entityName: "Model",
    availableParameters: [
      { value: "status", label: "Status" },
      { value: "type", label: "Type" },
    ],
  };

  it("renders drawer with title when open", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} />);
    expect(screen.getByText("Analytics & Trends")).toBeInTheDocument();
  });

  it("renders description", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} />);
    expect(screen.getByText("Track history over time")).toBeInTheDocument();
  });

  it("does not show content when closed", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} open={false} />);
    expect(screen.queryByText("Analytics & Trends")).not.toBeInTheDocument();
  });

  describe("keyboard navigation", () => {
    it("exposes a modal dialog labelled by the title", () => {
      renderWithProviders(<AnalyticsDrawer {...defaultProps} />);

      const dialog = screen.getByRole("dialog", { name: "Analytics & Trends" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(
        screen.getByRole("heading", { name: "Analytics & Trends", level: 2 }),
      ).toBeInTheDocument();
    });

    it("calls onClose when Escape is pressed", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(<AnalyticsDrawer {...defaultProps} onClose={onClose} />);

      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("keeps Tab focus inside the drawer", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <button type="button">Outside</button>
          <AnalyticsDrawer {...defaultProps} />
        </>,
      );

      const dialog = screen.getByRole("dialog", { name: "Analytics & Trends" });
      const outside = screen.getByRole("button", { name: "Outside", hidden: true });

      expect(outside.closest("[aria-hidden='true']")).not.toBeNull();

      for (let i = 0; i < 8; i++) {
        await user.tab();
        expect(outside).not.toHaveFocus();
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    it("returns focus to the trigger when closed with Escape", async () => {
      const user = userEvent.setup();

      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Open analytics
            </button>
            <AnalyticsDrawer {...defaultProps} open={open} onClose={() => setOpen(false)} />
          </>
        );
      }

      renderWithProviders(<Harness />);

      const trigger = screen.getByRole("button", { name: "Open analytics" });
      await user.click(trigger);

      expect(screen.getByRole("dialog", { name: "Analytics & Trends" })).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Analytics & Trends" }),
        ).not.toBeInTheDocument();
      });
      expect(trigger).toHaveFocus();
    });
  });
});
