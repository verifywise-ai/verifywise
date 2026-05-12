import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import BulkActionsToolbar, { type BulkAction } from "../index";

describe("BulkActionsToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when count is 0", () => {
    const { container } = renderWithProviders(
      <BulkActionsToolbar count={0} onClear={vi.fn()} actions={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders the selection count and the action labels", () => {
    const actions: BulkAction[] = [
      { id: "complete", label: "Mark complete", onClick: vi.fn() },
      { id: "tag", label: "Set categories", onClick: vi.fn() },
    ];

    renderWithProviders(<BulkActionsToolbar count={3} onClear={vi.fn()} actions={actions} />);

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark complete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set categories/i })).toBeInTheDocument();
  });

  it("calls onClear when the Clear button is clicked", async () => {
    const onClear = vi.fn();
    renderWithProviders(<BulkActionsToolbar count={2} onClear={onClear} actions={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /clear selection/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("invokes onClick directly for actions without a confirm step", async () => {
    const onClick = vi.fn();
    const actions: BulkAction[] = [{ id: "complete", label: "Mark complete", onClick }];

    renderWithProviders(<BulkActionsToolbar count={4} onClear={vi.fn()} actions={actions} />);

    await userEvent.click(screen.getByRole("button", { name: /mark complete/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a confirmation modal for actions with a confirm config and runs onClick on proceed", async () => {
    const onClick = vi.fn();
    const actions: BulkAction[] = [
      {
        id: "archive",
        label: "Archive",
        onClick,
        confirm: {
          title: "Archive 2 items?",
          body: "This will hide them from the active list.",
          confirmLabel: "Archive",
          danger: true,
        },
      },
    ];

    renderWithProviders(<BulkActionsToolbar count={2} onClear={vi.fn()} actions={actions} />);

    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));

    expect(screen.getByText("Archive 2 items?")).toBeInTheDocument();
    expect(screen.getByText(/hide them from the active list/i)).toBeInTheDocument();

    expect(onClick).not.toHaveBeenCalled();

    const dialogProceed = screen
      .getAllByRole("button", { name: /^archive$/i })
      .find((btn) => btn.closest('[role="dialog"]'));
    expect(dialogProceed).toBeDefined();
    await userEvent.click(dialogProceed!);

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Archive 2 items?")).not.toBeInTheDocument());
  });

  it("does not invoke onClick when the user cancels the confirmation", async () => {
    const onClick = vi.fn();
    const actions: BulkAction[] = [
      {
        id: "archive",
        label: "Archive",
        onClick,
        confirm: {
          title: "Archive 1 item?",
          body: "Confirm archive",
          confirmLabel: "Archive",
        },
      },
    ];

    renderWithProviders(<BulkActionsToolbar count={1} onClear={vi.fn()} actions={actions} />);

    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(screen.getByText("Archive 1 item?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Archive 1 item?")).not.toBeInTheDocument());
  });

  it("does not invoke onClick when the action is disabled", async () => {
    const onClick = vi.fn();
    const actions: BulkAction[] = [
      { id: "complete", label: "Mark complete", onClick, disabled: true },
    ];

    renderWithProviders(<BulkActionsToolbar count={1} onClear={vi.fn()} actions={actions} />);

    const button = screen.getByRole("button", { name: /mark complete/i });
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
