import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";

// Mock shared dependencies
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input data-testid={`field-${props.id || "field"}`} placeholder={props.placeholder} />
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => <div data-testid={`select-${props.id || "select"}`} />,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, ...props }: any) => (
    <button data-testid="customizable-button" disabled={props.isDisabled} onClick={props.onClick}>
      {props.text || children}
    </button>
  ),
}));
vi.mock("../../../Chip", () => ({
  default: ({ label }: any) => <span data-testid="vw-chip">{label}</span>,
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  getEntityById: vi.fn().mockResolvedValue({ data: null }),
}));
// Review, link and edit actions need the agentDiscovery.admin permission;
// tests default to granting it.
const permissionState = vi.hoisted(() => ({ canManage: true }));
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "agentDiscovery.admin" && permissionState.canManage,
}));
vi.mock("../../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  },
}));
// The owner picker: shows its value and, when clicked, picks user 2 only.
vi.mock("../../../Inputs/MultiSelect", () => ({
  default: (props: any) => (
    <button
      data-testid={`multiselect-${props.id}`}
      data-value={JSON.stringify(props.value)}
      onClick={() => props.onChange({ target: { value: [2] } })}
    >
      {props.label}
    </button>
  ),
}));
// Users come from the shared, cached users hook. refreshUsers is stable across
// renders, like the real hook's; a test can make it load a different list.
const BASE_USERS = [
  { id: 1, name: "Ada", surname: "Lovelace", email: "ada@example.com" },
  { id: 2, name: "Bea", surname: "Brown", email: "bea@example.com" },
];
const usersState = vi.hoisted(() => ({
  users: [] as { id: number; name: string; surname: string; email: string }[],
  refreshUsers: vi.fn(async () => {}),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: usersState.users,
    loading: false,
    error: null,
    refreshUsers: usersState.refreshUsers,
  }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validateAll: vi.fn().mockReturnValue(true),
    clearFieldError: vi.fn(),
    resetErrors: vi.fn(),
  }),
}));
vi.mock("../../../../../application/validations/stringValidation", () => ({
  checkStringValidation: () => ({ accepted: true, message: "" }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CustomException from "../../../../../infrastructure/exceptions/customeException";
import { apiServices } from "../../../../../infrastructure/api/networkServices";
import {
  getAllEntities,
  getEntityById,
} from "../../../../../application/repository/entity.repository";
import LinkModelModal from "../LinkModelModal";
import ManualAgentModal from "../ManualAgentModal";
import ReviewAgentModal from "../ReviewAgentModal";

const mockAgent = {
  id: 1,
  source_system: "manual",
  primitive_type: "agent",
  external_id: "ext-1",
  display_name: "Test Agent",
  owner_id: "1",
  permissions: [],
  permission_categories: ["read"],
  last_activity: "2026-01-01T00:00:00Z",
  metadata: { notes: "test" },
  review_status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  linked_model_inventory_id: null,
  is_stale: false,
  is_manual: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  usersState.users = [...BASE_USERS];
  usersState.refreshUsers.mockReset();
  usersState.refreshUsers.mockImplementation(async () => {});
  vi.mocked(apiServices.patch).mockClear();
  vi.mocked(apiServices.post).mockClear();
});

describe("LinkModelModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Link to model")).toBeInTheDocument();
  });

  it("renders select for model", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByTestId("select-model-select")).toBeInTheDocument();
  });

  it("renders cancel and link buttons", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Link model")).toBeInTheDocument();
  });
});

describe("ManualAgentModal", () => {
  it("renders without crashing when open (add mode)", () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Add agent manually")).toBeInTheDocument();
  });

  it("renders form fields", () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("field-display_name")).toBeInTheDocument();
    expect(screen.getByTestId("select-primitive_type")).toBeInTheDocument();
    // Owners is now a multi-select (an agent can have several accountable owners).
    expect(screen.getByText("Owners")).toBeInTheDocument();
    expect(screen.getByTestId("field-notes")).toBeInTheDocument();
  });

  it("renders in edit mode when agent prop is provided", () => {
    renderWithProviders(
      <ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} agent={mockAgent} />,
    );
    expect(screen.getByText("Edit agent")).toBeInTheDocument();
  });

  it("shows the server's reason when the save is rejected", async () => {
    vi.mocked(apiServices.post).mockRejectedValueOnce(
      new CustomException("Owners must be users in your organization", 400, {}),
    );
    const onSuccess = vi.fn();
    renderWithProviders(
      <ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={onSuccess} />,
    );
    fireEvent.click(screen.getByText("Add agent"));

    expect(
      await screen.findByText("Owners must be users in your organization"),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a generic message instead of a bare HTTP phrase or a server failure", async () => {
    vi.mocked(apiServices.patch).mockRejectedValueOnce(
      new CustomException("Internal Server Error", 500, {}),
    );
    renderWithProviders(
      <ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} agent={mockAgent} />,
    );
    fireEvent.click(screen.getByText("Save changes"));

    expect(await screen.findByText("Could not save the agent. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Internal Server Error")).not.toBeInTheDocument();
  });

  it("sends no owner fields when only the name or notes are edited", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_id: "9", owner_ids: [9, 1] }}
      />,
    );
    // Wait for the owner check, which leaves out unknown owner 9.
    await screen.findByTestId("agent-dropped-owners-note");
    fireEvent.click(screen.getByText("Save changes"));

    await vi.waitFor(() => expect(apiServices.patch).toHaveBeenCalled());
    const payload = vi.mocked(apiServices.patch).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("owner_ids");
    expect(payload).not.toHaveProperty("owner_id");
    expect(payload).toEqual(expect.objectContaining({ display_name: "Test Agent" }));
  });

  it("sends owner_ids when the owner selection was changed", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_ids: [1] }}
      />,
    );
    fireEvent.click(screen.getByTestId("multiselect-owner_ids"));
    fireEvent.click(screen.getByText("Save changes"));

    await vi.waitFor(() => expect(apiServices.patch).toHaveBeenCalled());
    expect(vi.mocked(apiServices.patch).mock.calls[0][1]).toEqual(
      expect.objectContaining({ owner_ids: [2] }),
    );
  });

  it("always sends owner_ids for a new agent", async () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText("Add agent"));
    await vi.waitFor(() => expect(apiServices.post).toHaveBeenCalled());
    expect(vi.mocked(apiServices.post).mock.calls[0][1]).toEqual(
      expect.objectContaining({ owner_ids: [] }),
    );
  });

  it("refreshes the users on open and flags only owners still unknown afterwards", async () => {
    // The cached list lacks users 3 and 9; the refresh brings back user 3 only.
    let finishRefresh: () => void = () => {};
    usersState.refreshUsers.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = () => {
            usersState.users = [
              ...BASE_USERS,
              { id: 3, name: "Cy", surname: "Coe", email: "cy@example.com" },
            ];
            resolve();
          };
        }),
    );
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_id: "3", owner_ids: [3, 9, 1] }}
      />,
    );

    expect(usersState.refreshUsers).toHaveBeenCalledTimes(1);
    // Not decided on the stale list.
    expect(screen.queryByTestId("agent-dropped-owners-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("multiselect-owner_ids")).toHaveAttribute("data-value", "[3,9,1]");

    await act(async () => {
      finishRefresh();
    });

    expect(
      await screen.findByText(
        "Some owners are no longer in your organization. They will be removed if you change the owners.",
      ),
    ).toBeInTheDocument();
    // Only 9 is still unknown, so only 9 leaves the picker.
    expect(screen.getByTestId("multiselect-owner_ids")).toHaveAttribute("data-value", "[3,1]");
  });

  it("uses the cached users and does not refresh them when adding an agent", async () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText("Add agent manually")).toBeInTheDocument();
    expect(usersState.refreshUsers).not.toHaveBeenCalled();
  });

  it("does not refresh the users when editing an agent without owners", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_id: null, owner_ids: [] }}
      />,
    );
    await act(async () => {});
    expect(usersState.refreshUsers).not.toHaveBeenCalled();
    expect(screen.queryByTestId("agent-dropped-owners-note")).not.toBeInTheDocument();
  });

  it("shows no removal note when every owner is still a user", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_ids: [2, 1] }}
      />,
    );
    await vi.waitFor(() => expect(usersState.refreshUsers).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("agent-dropped-owners-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("multiselect-owner_ids")).toHaveAttribute("data-value", "[2,1]");
  });

  it("shows a legacy text owner read-only, and picks no user for it", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, owner_id: "Data platform team", owner_ids: [] }}
      />,
    );
    expect(
      screen.getByText(
        'Current owner "Data platform team" is not a VerifyWise user. Choosing owners replaces it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("multiselect-owner_ids")).toHaveAttribute("data-value", "[]");
    await act(async () => {});
    expect(screen.queryByTestId("agent-dropped-owners-note")).not.toBeInTheDocument();
  });

  it("shows no legacy owner note for an agent whose owners are users", () => {
    renderWithProviders(
      <ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} agent={mockAgent} />,
    );
    expect(screen.queryByTestId("agent-legacy-owner-note")).not.toBeInTheDocument();
  });
});

describe("ReviewAgentModal", () => {
  it("renders without crashing when open with agent", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Agent details")).toBeInTheDocument();
  });

  it("renders agent details", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
  });

  it("renders confirm and reject buttons for pending agent", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("shows a read-only view to a user who may not change agents", () => {
    permissionState.canManage = false;
    try {
      renderWithProviders(
        <ReviewAgentModal
          isOpen={true}
          setIsOpen={vi.fn()}
          agent={{ ...mockAgent, is_manual: true, linked_model_inventory_id: null }}
          onSuccess={vi.fn()}
          onEdit={vi.fn()}
        />,
      );
      expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
      expect(screen.queryByText("Reject")).not.toBeInTheDocument();
      expect(screen.queryByText("Link to model")).not.toBeInTheDocument();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.getByText("Not linked")).toBeInTheDocument();
    } finally {
      permissionState.canManage = true;
    }
  });

  it("shows the server's reason when a review is rejected", async () => {
    vi.mocked(apiServices.patch).mockRejectedValueOnce(
      new CustomException("You do not have permission to review agents", 403, {}),
    );
    const onSuccess = vi.fn();
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, review_status: "unreviewed" }}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByText("Confirm"));
    expect(
      await screen.findByText("You do not have permission to review agents"),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("returns null when agent is null", () => {
    const { container } = renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={null} onSuccess={vi.fn()} />,
    );
    expect(container.querySelector('[class*="MuiDrawer"]')).toBeNull();
  });

  it("shows the review status with the same label as the table and filter", () => {
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, review_status: "unreviewed" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Unreviewed")).toBeInTheDocument();
    expect(screen.queryByText("unreviewed")).not.toBeInTheDocument();
  });

  it("lists every owner, primary first, under Owners", () => {
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, owner_id: "2", owner_ids: [2, 1, 9] }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Owners")).toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
    expect(screen.getByText("Bea Brown, Ada Lovelace, User #9")).toBeInTheDocument();
  });

  it("shows a manual agent's legacy text owner when it has no owner set", () => {
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, owner_id: "Data platform team" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Data platform team")).toBeInTheDocument();
  });

  it("shows a synced agent's source-reported owner as is", () => {
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{
          ...mockAgent,
          is_manual: false,
          source_system: "azure-ai-foundry",
          owner_id: "alice@contoso.com",
        }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("alice@contoso.com")).toBeInTheDocument();
    expect(screen.queryByText(/User #/)).not.toBeInTheDocument();
  });

  it("fetches only the linked model, not the whole inventory", async () => {
    vi.mocked(getAllEntities).mockClear();
    vi.mocked(getEntityById).mockResolvedValueOnce({
      data: { id: 9, provider: "OpenAI", model: "gpt-4o" },
    });
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, linked_model_inventory_id: 9 }}
        onSuccess={vi.fn()}
      />,
    );
    expect(await screen.findByText("OpenAI · gpt-4o")).toBeInTheDocument();
    expect(getEntityById).toHaveBeenCalledWith({ routeUrl: "/modelInventory/9" });
    expect(getAllEntities).not.toHaveBeenCalledWith({ routeUrl: "/modelInventory" });
    expect(getAllEntities).not.toHaveBeenCalledWith({ routeUrl: "/users" });
  });
});
