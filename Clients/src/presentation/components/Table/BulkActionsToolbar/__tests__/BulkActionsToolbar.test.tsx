import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import BulkActionsToolbar, { type BulkAction } from "../index";
import { accent } from "../../../../themes/palette";

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

  // WCAG 2.x relative luminance contrast; 4.5:1 is AA for 13px text.
  function contrast(a: [number, number, number], b: [number, number, number]): number {
    const lum = ([r, g, b2]: [number, number, number]) => {
      const c = [r, g, b2].map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  const parseRgb = (value: string): [number, number, number] => {
    const [r, g, b] = (value.match(/\d+/g) ?? []).map(Number);
    return [r, g, b];
  };
  const parseHex = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];

  it("keeps danger actions readable on the bar (WCAG AA)", () => {
    const actions: BulkAction[] = [
      {
        id: "delete",
        label: "Delete",
        onClick: vi.fn(),
        confirm: { title: "Delete?", body: "Sure?", confirmLabel: "Delete", danger: true },
      },
    ];
    renderWithProviders(<BulkActionsToolbar count={1} onClear={vi.fn()} actions={actions} />);

    const toolbar = screen.getByRole("toolbar");
    const deleteButton = screen.getByRole("button", { name: /delete/i });
    const fill = getComputedStyle(toolbar).backgroundColor;
    expect(parseRgb(fill)).toEqual(parseHex(accent.primary.bg));
    const label = parseRgb(getComputedStyle(deleteButton).color);
    expect(contrast(label, parseRgb(fill))).toBeGreaterThanOrEqual(4.5);
  });
});
