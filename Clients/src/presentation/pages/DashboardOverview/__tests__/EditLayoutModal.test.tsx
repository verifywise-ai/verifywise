import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EditLayoutModal from "../EditLayoutModal";
import type { ViewWidget, DashboardWidgetKey } from "../widgetRegistry";

const widgets: ViewWidget[] = [
  { key: "quick-stats", visible: true },
  { key: "organizational-frameworks", visible: true },
  { key: "task-radar", visible: false },
  { key: "model-risks", visible: true },
];
const defaults: ViewWidget[] = [
  { key: "task-radar", visible: true },
  { key: "quick-stats", visible: true },
  { key: "organizational-frameworks", visible: true },
  { key: "model-risks", visible: true },
];

const setup = (overrides: Partial<React.ComponentProps<typeof EditLayoutModal>> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  renderWithProviders(
    <EditLayoutModal
      widgets={widgets}
      defaults={defaults}
      isAvailable={(key: DashboardWidgetKey) => key !== "organizational-frameworks"}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onClose, user: userEvent.setup() };
};

describe("EditLayoutModal", () => {
  it("lists only the widgets the person can have, hidden ones included", () => {
    setup();
    expect(screen.getByText("Quick stats")).toBeInTheDocument();
    expect(screen.getByText("Task radar")).toBeInTheDocument();
    expect(screen.queryByText("Organizational frameworks")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show Task radar" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Show Quick stats" })).toBeChecked();
  });

  it("disables moving past either end", () => {
    setup();
    expect(screen.getByRole("button", { name: "Move Quick stats up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Model risks down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Task radar up" })).toBeEnabled();
  });

  it("saves toggles and moves, keeping widgets it did not show", async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole("switch", { name: "Show Task radar" }));
    await user.click(screen.getByRole("button", { name: "Move Model risks up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith([
      { key: "quick-stats", visible: true },
      { key: "organizational-frameworks", visible: true },
      { key: "model-risks", visible: true },
      { key: "task-radar", visible: true },
    ]);
  });

  it("resets the draft to the default layout", async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(defaults));
  });

  it("closes after a successful save", async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays open and says so when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    const { onClose, user } = setup({ onSave });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save your layout. Try again.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cannot be closed while a save is in flight", async () => {
    let finish: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onClose, user } = setup({ onSave });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("discards the draft on cancel", async () => {
    const { onSave, onClose, user } = setup();
    await user.click(screen.getByRole("switch", { name: "Show Task radar" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
