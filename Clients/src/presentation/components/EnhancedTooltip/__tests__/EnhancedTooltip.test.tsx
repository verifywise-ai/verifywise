import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { EnhancedTooltip } from "../index";

describe("EnhancedTooltip Component", () => {
  it("renders the trigger children", () => {
    renderWithProviders(
      <EnhancedTooltip title="Help" content="Some help text">
        <span>Info icon</span>
      </EnhancedTooltip>,
    );

    expect(screen.getByText("Info icon")).toBeInTheDocument();
  });

  it("has role=button on the trigger wrapper", () => {
    renderWithProviders(
      <EnhancedTooltip title="Title" content="Content">
        <span>Trigger</span>
      </EnhancedTooltip>,
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has aria-haspopup attribute on the trigger", () => {
    renderWithProviders(
      <EnhancedTooltip title="Title" content="Content">
        <span>Accessible trigger</span>
      </EnhancedTooltip>,
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-haspopup", "true");
  });

  it("has tabIndex=0 for keyboard accessibility", () => {
    renderWithProviders(
      <EnhancedTooltip title="Keyboard" content="Accessible">
        <span>Focusable</span>
      </EnhancedTooltip>,
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("tabindex", "0");
  });

  it("does not show popover content initially", () => {
    renderWithProviders(
      <EnhancedTooltip title="Hidden Title" content="Hidden Content">
        <span>Hover me</span>
      </EnhancedTooltip>,
    );

    expect(screen.queryByText("Hidden Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden Content")).not.toBeInTheDocument();
  });

  it("opens popover on mouse enter and shows title and content", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Tooltip Title" content="Tooltip body text">
        <span>Hover target</span>
      </EnhancedTooltip>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(screen.getByText("Tooltip Title")).toBeInTheDocument();
    });
    expect(screen.getByText("Tooltip body text")).toBeInTheDocument();
  });

  it("closes popover when mouse leaves the popover paper", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Close on Leave" content="Body">
        <span>Hover</span>
      </EnhancedTooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Close on Leave")).toBeInTheDocument();
    });

    const popoverPaper = screen.getByText("Close on Leave").closest(".MuiPopover-paper");
    expect(popoverPaper).toBeInTheDocument();

    fireEvent.mouseLeave(popoverPaper!);
    await waitFor(() => {
      expect(screen.queryByText("Close on Leave")).not.toBeInTheDocument();
    });
  });

  it("closes popover when close button is clicked", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Dismissible" content="Click X to close">
        <span>Hover trigger</span>
      </EnhancedTooltip>,
    );

    const user = userEvent.setup();
    fireEvent.mouseEnter(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Dismissible")).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText("Close tooltip");
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("Dismissible")).not.toBeInTheDocument();
    });
  });

  it("opens popover on Enter key press", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Enter Key" content="Opened via Enter">
        <span>Press Enter</span>
      </EnhancedTooltip>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Enter Key")).toBeInTheDocument();
    });
    expect(screen.getByText("Opened via Enter")).toBeInTheDocument();
  });

  it("opens popover on Space key press", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Space Key" content="Opened via Space">
        <span>Press Space</span>
      </EnhancedTooltip>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: " " });

    await waitFor(() => {
      expect(screen.getByText("Space Key")).toBeInTheDocument();
    });
    expect(screen.getByText("Opened via Space")).toBeInTheDocument();
  });

  it("keeps popover open when hovering over the popover content", async () => {
    renderWithProviders(
      <EnhancedTooltip title="Stay Open" content="Hover over me">
        <span>Trigger</span>
      </EnhancedTooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Stay Open")).toBeInTheDocument();
    });

    const popoverPaper = screen.getByText("Stay Open").closest(".MuiPopover-paper");
    fireEvent.mouseEnter(popoverPaper!);

    expect(screen.getByText("Stay Open")).toBeInTheDocument();
  });
});
