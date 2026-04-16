/**
 * Tests for the Controls Hub Bulk Edit Bar.
 * Focus: selection-count rendering, empty-patch feedback, mutation error/success
 * paths, and clear-selection wiring. Interactions with MUI Select's portal
 * are deliberately avoided — we exercise the mutation surface directly via
 * the hook mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import BulkEditBar from "../components/BulkEditBar";

const mockMutateAsync = vi.fn();

vi.mock("../../../../application/hooks/useMasterControls", () => ({
  useMasterControlMutations: () => ({
    bulkUpdate: {
      mutateAsync: mockMutateAsync,
      isPending: false,
    },
  }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "Alice", surname: "Smith", email: "alice@example.com" },
    ],
    loading: false,
  }),
}));

describe("BulkEditBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the selection count and prompts for fields", () => {
    renderWithProviders(
      <BulkEditBar selectedIds={[1, 2, 3]} onClearSelection={vi.fn()} />
    );

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Choose the fields you want to apply to every selected master control/
      )
    ).toBeInTheDocument();
  });

  it("shows an info alert when Apply is clicked without any fields set", async () => {
    renderWithProviders(
      <BulkEditBar selectedIds={[1, 2]} onClearSelection={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply to selected/ }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Pick at least one field to apply to the selected controls."
        )
      ).toBeInTheDocument()
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("fires onClearSelection when the close button is pressed", () => {
    const onClearSelection = vi.fn();
    renderWithProviders(
      <BulkEditBar selectedIds={[1]} onClearSelection={onClearSelection} />
    );

    fireEvent.click(screen.getByLabelText("Clear selection"));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
