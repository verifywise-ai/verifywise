import { screen } from "@testing-library/react";
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
});
