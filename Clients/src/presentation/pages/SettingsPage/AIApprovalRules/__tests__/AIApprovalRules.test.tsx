import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { ApprovalRule } from "../../../../../application/repository/aiApprovalRules.repository";

const mockListApprovalRules = vi.fn();
const mockCreateApprovalRule = vi.fn();
const mockUpdateApprovalRule = vi.fn();
const mockDeleteApprovalRule = vi.fn();

vi.mock("../../../../../application/repository/aiApprovalRules.repository", () => ({
  listApprovalRules: (...args: any[]) => mockListApprovalRules(...args),
  createApprovalRule: (...args: any[]) => mockCreateApprovalRule(...args),
  updateApprovalRule: (...args: any[]) => mockUpdateApprovalRule(...args),
  deleteApprovalRule: (...args: any[]) => mockDeleteApprovalRule(...args),
}));

import AIApprovalRules from "../index";

const buildRule = (overrides: Partial<ApprovalRule> = {}): ApprovalRule => ({
  id: 1,
  name: "High risk requires approval",
  description: "Anything high risk needs a human",
  conditions: { all: [{ fact: "risk_level", operator: "equal", value: "high" }] },
  event_type: "require-approval",
  event_params: {},
  priority: 100,
  is_active: true,
  is_default: false,
  organization_id: 1,
  ...overrides,
});

describe("AIApprovalRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListApprovalRules.mockResolvedValue([buildRule()]);
  });

  it("shows a loading spinner while fetching rules", () => {
    mockListApprovalRules.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AIApprovalRules />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders fetched rules after loading", async () => {
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("High risk requires approval")).toBeInTheDocument();
    });
    expect(screen.getByText("Require Approval")).toBeInTheDocument();
    expect(screen.getByText(/Priority: 100/)).toBeInTheDocument();
  });

  it("shows empty state when there are no rules", async () => {
    mockListApprovalRules.mockResolvedValue([]);
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("No approval rules configured.")).toBeInTheDocument();
    });
  });

  it("falls back to an empty list when the API returns a non-array", async () => {
    mockListApprovalRules.mockResolvedValue(null);
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("No approval rules configured.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when fetching rules fails", async () => {
    mockListApprovalRules.mockRejectedValue(new Error("network error"));
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load approval rules")).toBeInTheDocument();
    });
  });

  it("does not show toggle/edit/delete controls for default rules", async () => {
    mockListApprovalRules.mockResolvedValue([buildRule({ is_default: true, id: null })]);
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("Default")).toBeInTheDocument();
    });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("toggles a rule's active state", async () => {
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByRole("switch")).toBeInTheDocument());
    mockUpdateApprovalRule.mockResolvedValue(buildRule({ is_active: false }));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(mockUpdateApprovalRule).toHaveBeenCalledWith(1, { is_active: false });
    });
  });

  it("shows an error alert when toggle fails", async () => {
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByRole("switch")).toBeInTheDocument());
    mockUpdateApprovalRule.mockRejectedValue(new Error("fail"));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(screen.getByText("Failed to toggle rule")).toBeInTheDocument();
    });
  });

  it("deletes a rule after confirmation", async () => {
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());
    mockDeleteApprovalRule.mockResolvedValue(undefined);
    mockListApprovalRules.mockResolvedValue([]);

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash2"));
    fireEvent.click(trashButton!);

    await waitFor(() => {
      expect(mockDeleteApprovalRule).toHaveBeenCalledWith(1);
    });
  });

  it("does not delete when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash2"));
    fireEvent.click(trashButton!);

    expect(mockDeleteApprovalRule).not.toHaveBeenCalled();
  });

  it("shows an error alert when delete fails", async () => {
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());
    mockDeleteApprovalRule.mockRejectedValue(new Error("fail"));

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash2"));
    fireEvent.click(trashButton!);

    await waitFor(() => {
      expect(screen.getByText("Failed to delete rule")).toBeInTheDocument();
    });
  });

  it("opens the create dialog and creates a new rule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());

    await user.click(screen.getByText("Add Rule"));
    expect(screen.getByText("Create Rule")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const nameField = within(dialog).getByLabelText(/Name/);
    await user.type(nameField, "My new rule");

    mockCreateApprovalRule.mockResolvedValue(buildRule({ id: 2, name: "My new rule" }));
    await user.click(within(dialog).getByText("Save"));

    await waitFor(() => {
      expect(mockCreateApprovalRule).toHaveBeenCalled();
    });
    const createArgs = mockCreateApprovalRule.mock.calls[0][0];
    expect(createArgs.name).toBe("My new rule");
  });

  it("opens the edit dialog for a non-default rule and saves changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button");
    const editButton = editButtons.find((btn) => btn.querySelector("svg.lucide-pen"));
    await user.click(editButton!);

    expect(screen.getByText("Edit Rule")).toBeInTheDocument();
    mockUpdateApprovalRule.mockResolvedValue(buildRule({ name: "Updated name" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateApprovalRule).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1 }));
    });
  });

  it("shows an error alert when saving fails", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());

    await user.click(screen.getByText("Add Rule"));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Name/), "Broken rule");

    mockCreateApprovalRule.mockRejectedValue(new Error("fail"));
    await user.click(within(dialog).getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Failed to save rule")).toBeInTheDocument();
    });
  });

  it("closes the create dialog on cancel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => expect(screen.getByText("High risk requires approval")).toBeInTheDocument());

    await user.click(screen.getByText("Add Rule"));
    expect(screen.getByText("Create Rule")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Create Rule")).not.toBeInTheDocument();
    });
  });

  it("clears the error alert when closed", async () => {
    mockListApprovalRules.mockRejectedValue(new Error("network error"));
    renderWithProviders(<AIApprovalRules />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load approval rules")).toBeInTheDocument();
    });
    const alert = screen.getByText("Failed to load approval rules").closest('[role="alert"]') as HTMLElement;
    const closeBtn = within(alert).getByRole("button");
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText("Failed to load approval rules")).not.toBeInTheDocument();
    });
  });
});
