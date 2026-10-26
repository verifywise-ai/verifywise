import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";

// Mock shared dependencies
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input
      data-testid={`field-${props.id || "field"}`}
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange ?? (() => {})}
    />
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
// The owner, use case and model pickers. data-value holds the selected ids. A
// click picks user 2 (owners) or the first option (single pickers); the
// "-clear" button empties the picker.
vi.mock("../../../Inputs/Autocomplete", () => ({
  default: (props: any) => (
    <span>
      <button
        data-testid={`autocomplete-${props.id}`}
        data-value={JSON.stringify(
          props.multiple ? props.value.map((o: any) => o.id) : (props.value?.id ?? null),
        )}
        data-options={JSON.stringify(props.options.map((o: any) => o.id))}
        data-no-options={props.noOptionsText}
        onClick={() =>
          props.onChange(
            {},
            props.multiple
              ? props.options.filter((o: any) => o.id === 2)
              : (props.options[0] ?? null),
          )
        }
      >
        {props.label}
      </button>
      <button
        data-testid={`autocomplete-${props.id}-clear`}
        onClick={() => props.onChange({}, props.multiple ? [] : null)}
      />
    </span>
  ),
}));
// Use cases come from the shared projects query; organizational (framework)
// projects are not use cases.
const projectsState = vi.hoisted(() => ({
  projects: [
    { id: 5, project_title: "Claims triage", is_organizational: false },
    { id: 6, project_title: "Organization ISO 42001", is_organizational: true },
  ],
  enabledCalls: [] as (boolean | undefined)[],
  isError: false,
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: (options?: { enabled?: boolean }) => {
    projectsState.enabledCalls.push(options?.enabled);
    return { approvedProjects: projectsState.projects, isError: projectsState.isError };
  },
}));
// Models come from the shared model inventory query.
const modelsState = vi.hoisted(() => ({
  models: [] as { id: number; provider: string; model: string }[],
  isError: false,
}));
vi.mock("../../../../../application/hooks/useModelInventories", () => ({
  useModelInventories: () => ({ data: modelsState.models, isError: modelsState.isError }),
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
import LinkAgentModal from "../LinkAgentModal";
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
  modelsState.models = [];
  modelsState.isError = false;
  projectsState.enabledCalls = [];
  projectsState.isError = false;
  vi.mocked(apiServices.patch).mockClear();
  vi.mocked(apiServices.post).mockClear();
});

describe("LinkAgentModal", () => {
  it("links a model with the model picker", async () => {
    modelsState.models = [{ id: 7, provider: "OpenAI", model: "gpt-4o" }];
    const onSuccess = vi.fn();
    renderWithProviders(
      <LinkAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agentId={1}
        kind="model"
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText("Link to model")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("autocomplete-link-model-select"));
    await act(async () => {
      fireEvent.click(screen.getByText("Link model"));
    });
    expect(apiServices.patch).toHaveBeenCalledWith("/agent-primitives/1/link-model", {
      model_id: 7,
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("links a use case and offers only use cases, not framework projects", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <LinkAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agentId={1}
        kind="useCase"
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText("Link to use case")).toBeInTheDocument();
    const picker = screen.getByTestId("autocomplete-link-use-case-select");
    expect(JSON.parse(picker.getAttribute("data-options")!)).toEqual([5]);
    fireEvent.click(picker);
    await act(async () => {
      fireEvent.click(screen.getByText("Link use case"));
    });
    expect(apiServices.patch).toHaveBeenCalledWith("/agent-primitives/1/link-use-case", {
      project_id: 5,
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("keeps the link button disabled until something is picked", () => {
    renderWithProviders(
      <LinkAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agentId={1}
        kind="useCase"
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Link use case")).toBeDisabled();
  });

  it("says the list could not be loaded instead of showing it as empty", () => {
    projectsState.isError = true;
    renderWithProviders(
      <LinkAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agentId={1}
        kind="useCase"
        onSuccess={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("autocomplete-link-use-case-select").getAttribute("data-no-options"),
    ).toBe("Could not load use cases");
  });

  it("shows the server's reason and stays open when the link fails", async () => {
    vi.mocked(apiServices.patch).mockRejectedValueOnce(
      new CustomException("Linked use case was not found", 400, {}),
    );
    const onSuccess = vi.fn();
    renderWithProviders(
      <LinkAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agentId={1}
        kind="useCase"
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByTestId("autocomplete-link-use-case-select"));
    await act(async () => {
      fireEvent.click(screen.getByText("Link use case"));
    });
    expect(await screen.findByText("Linked use case was not found")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
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
    // Owners is a multi-select (an agent can have several accountable owners).
    expect(screen.getByText("Owners")).toBeInTheDocument();
    expect(screen.getByTestId("field-description")).toBeInTheDocument();
    expect(screen.getByTestId("autocomplete-linked_project_id")).toBeInTheDocument();
    expect(screen.getByTestId("autocomplete-linked_model_inventory_id")).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId("autocomplete-owner_ids"));
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
    // The picker can only show owners in the (stale) user list until the refresh.
    expect(screen.getByTestId("autocomplete-owner_ids")).toHaveAttribute("data-value", "[1]");

    await act(async () => {
      finishRefresh();
    });

    expect(
      await screen.findByText(
        "Some owners are no longer in your organization. They will be removed if you change the owners.",
      ),
    ).toBeInTheDocument();
    // Only 9 is still unknown, so only 9 leaves the picker.
    expect(screen.getByTestId("autocomplete-owner_ids")).toHaveAttribute("data-value", "[3,1]");
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
    expect(screen.getByTestId("autocomplete-owner_ids")).toHaveAttribute("data-value", "[2,1]");
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
    expect(screen.getByTestId("autocomplete-owner_ids")).toHaveAttribute("data-value", "[]");
    await act(async () => {});
    expect(screen.queryByTestId("agent-dropped-owners-note")).not.toBeInTheDocument();
  });

  it("sends the description and both links for a new agent", async () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("field-description"), {
      target: { value: "  Triages incoming claims  " },
    });
    fireEvent.click(screen.getByText("Add agent"));
    await vi.waitFor(() => expect(apiServices.post).toHaveBeenCalled());
    expect(vi.mocked(apiServices.post).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        description: "Triages incoming claims",
        linked_model_inventory_id: null,
        linked_project_id: null,
      }),
    );
  });

  it("offers only use cases, not organizational projects, and sends the chosen one", async () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    const picker = screen.getByTestId("autocomplete-linked_project_id");
    expect(picker).toHaveAttribute("data-options", "[5]");
    fireEvent.click(picker);
    fireEvent.click(screen.getByText("Add agent"));
    await vi.waitFor(() => expect(apiServices.post).toHaveBeenCalled());
    expect(vi.mocked(apiServices.post).mock.calls[0][1]).toEqual(
      expect.objectContaining({ linked_project_id: 5 }),
    );
  });

  it("links a model from the inventory", async () => {
    modelsState.models = [{ id: 7, provider: "OpenAI", model: "gpt-4o" }];
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    const picker = screen.getByTestId("autocomplete-linked_model_inventory_id");
    expect(picker).toHaveAttribute("data-options", "[7]");
    fireEvent.click(picker);
    fireEvent.click(screen.getByText("Add agent"));
    await vi.waitFor(() => expect(apiServices.post).toHaveBeenCalled());
    expect(vi.mocked(apiServices.post).mock.calls[0][1]).toEqual(
      expect.objectContaining({ linked_model_inventory_id: 7 }),
    );
  });

  it("fetches the pickers' lists only while the drawer is open", () => {
    renderWithProviders(
      <ManualAgentModal isOpen={false} setIsOpen={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(projectsState.enabledCalls).not.toContain(true);
    expect(projectsState.enabledCalls).toContain(false);
  });

  it("keeps a current model link when the inventory fails to load", () => {
    modelsState.isError = true;
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, linked_model_inventory_id: 9 }}
      />,
    );
    const picker = screen.getByTestId("autocomplete-linked_model_inventory_id");
    expect(picker).toHaveAttribute("data-options", "[9]");
    expect(picker).toHaveAttribute("data-value", "9");
  });

  it("sends no description or link fields on an edit that leaves them alone", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{
          ...mockAgent,
          description: "Triages claims",
          linked_project_id: 5,
          linked_model_inventory_id: 7,
        }}
      />,
    );
    fireEvent.click(screen.getByText("Save changes"));
    await vi.waitFor(() => expect(apiServices.patch).toHaveBeenCalled());
    const payload = vi.mocked(apiServices.patch).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("linked_project_id");
    expect(payload).not.toHaveProperty("linked_model_inventory_id");
  });

  it("sends null to remove a link and to clear the description", async () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, description: "Triages claims", linked_project_id: 5 }}
      />,
    );
    fireEvent.click(screen.getByTestId("autocomplete-linked_project_id-clear"));
    fireEvent.change(screen.getByTestId("field-description"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save changes"));
    await vi.waitFor(() => expect(apiServices.patch).toHaveBeenCalled());
    const payload = vi.mocked(apiServices.patch).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({ linked_project_id: null, description: null }),
    );
    expect(payload).not.toHaveProperty("linked_model_inventory_id");
  });

  it("keeps a linked use case that is not in the list selectable", () => {
    renderWithProviders(
      <ManualAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        agent={{ ...mockAgent, linked_project_id: 99, linked_project_title: "Pending use case" }}
      />,
    );
    const picker = screen.getByTestId("autocomplete-linked_project_id");
    expect(picker).toHaveAttribute("data-value", "99");
    expect(picker).toHaveAttribute("data-options", "[5,99]");
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
      expect(screen.queryByText("Link to use case")).not.toBeInTheDocument();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.getAllByText("Not linked")).toHaveLength(2);
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

  it("lets a synced agent, which has no Edit, link a use case", () => {
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, is_manual: false, source_system: "azure_ai_foundry" }}
        onSuccess={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Link to use case"));
    expect(screen.getByTestId("autocomplete-link-use-case-select")).toBeInTheDocument();
  });

  it("shows the linked use case and unlinks it", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{
          ...mockAgent,
          is_manual: false,
          linked_project_id: 5,
          linked_project_title: "Claims triage",
        }}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText("Claims triage")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Unlink use case"));
    });
    expect(apiServices.patch).toHaveBeenCalledWith("/agent-primitives/1/unlink-use-case");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("sends one unlink even when the icon is clicked twice", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(apiServices.patch).mockImplementationOnce(
      () => new Promise((r) => (resolve = r)) as any,
    );
    renderWithProviders(
      <ReviewAgentModal
        isOpen={true}
        setIsOpen={vi.fn()}
        agent={{ ...mockAgent, is_manual: false, linked_project_id: 5, linked_project_title: "X" }}
        onSuccess={vi.fn()}
      />,
    );
    const unlink = screen.getByLabelText("Unlink use case");
    fireEvent.click(unlink);
    fireEvent.click(unlink);
    await act(async () => resolve({}));
    expect(apiServices.patch).toHaveBeenCalledTimes(1);
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
