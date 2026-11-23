import { describe, it, expect, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import HeatCellNotice from "../HeatCellNotice";

describe("HeatCellNotice", () => {
  it("says that a heat map cell filters the register, as a status", () => {
    renderWithProviders(<HeatCellNotice onClear={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "The table shows only the risks in the selected heat map cell.",
    );
  });

  it("clears the filter with the way back it offers", async () => {
    const onClear = vi.fn();
    renderWithProviders(<HeatCellNotice onClear={onClear} />);

    await userEvent.click(screen.getByText("Show all risks"));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does not clear anything until the link is used", () => {
    const onClear = vi.fn();
    renderWithProviders(<HeatCellNotice onClear={onClear} />);

    expect(onClear).not.toHaveBeenCalled();
  });

  // The reader chose a cell on the Insights tab and was taken to the Risks tab, so the focus would
  // otherwise fall to the page. Only then: a notice that opens because the Risks tab was opened by
  // hand must not take the focus from the tab list.
  describe("the focus", () => {
    it("is taken by the notice when the reader came from choosing a cell", () => {
      renderWithProviders(<HeatCellNotice onClear={vi.fn()} focusOnMount />);

      expect(screen.getByRole("status")).toHaveFocus();
      // A place focus can be sent to, not a stop of the tab order.
      expect(screen.getByRole("status")).toHaveAttribute("tabindex", "-1");
    });

    it("is not taken when the notice opens for any other reason", () => {
      const onFocused = vi.fn();
      renderWithProviders(<HeatCellNotice onClear={vi.fn()} onFocused={onFocused} />);

      expect(screen.getByRole("status")).not.toHaveFocus();
      expect(document.body).toHaveFocus();
      expect(onFocused).not.toHaveBeenCalled();
    });

    it("is not taken when it is asked for explicitly not to", () => {
      const onFocused = vi.fn();
      renderWithProviders(
        <HeatCellNotice onClear={vi.fn()} focusOnMount={false} onFocused={onFocused} />,
      );

      expect(screen.getByRole("status")).not.toHaveFocus();
      expect(onFocused).not.toHaveBeenCalled();
    });

    it("tells the page once that it took the focus", () => {
      const onFocused = vi.fn();
      renderWithProviders(<HeatCellNotice onClear={vi.fn()} focusOnMount onFocused={onFocused} />);

      expect(onFocused).toHaveBeenCalledTimes(1);
    });

    it("does not take it again when it renders again, nor after the page took the answer", () => {
      const onFocused = vi.fn();
      const view = renderWithProviders(
        <HeatCellNotice onClear={vi.fn()} focusOnMount onFocused={onFocused} />,
      );
      // The reader moves on to the link.
      const link = screen.getByText("Show all risks");
      act(() => link.focus());
      expect(link).toHaveFocus();

      // The page took the answer (it is no longer asked for) and renders again.
      view.rerender(
        <HeatCellNotice onClear={vi.fn()} focusOnMount={false} onFocused={onFocused} />,
      );

      expect(link).toHaveFocus();
      expect(onFocused).toHaveBeenCalledTimes(1);
    });

    it("still says what it says and clears the filter, with the focus on it", async () => {
      const onClear = vi.fn();
      renderWithProviders(<HeatCellNotice onClear={onClear} focusOnMount />);

      expect(screen.getByRole("status")).toHaveTextContent(
        "The table shows only the risks in the selected heat map cell.",
      );
      await userEvent.click(screen.getByText("Show all risks"));
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });
});
