/**
 * End-to-end wire-up smoke test for the Controls Hub Details tab.
 *
 * Exercises the full save pipeline from the UI surface:
 *   Form edit → diffPayload → useMasterControlMutations.update.mutateAsync
 *
 * The mutation is mocked at the hook boundary, so this test guarantees that
 * the client shipped the correct sparse patch to the backend contract — which
 * is what the propagation service then fans out to every mapped framework
 * row. The backend side of that contract is covered by the controller
 * integration tests (Servers/controllers/__tests__/masterControl.ctrl.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DetailsTab from "../components/MasterControlDrawer/DetailsTab";
import {
  MasterControlModel,
  type MasterControlStatus,
} from "../../../../domain/models/Common/masterControl/masterControl.model";

const mockUpdateMutateAsync = vi.fn();

vi.mock("../../../../application/hooks/useMasterControls", () => ({
  useMasterControlMutations: () => ({
    update: {
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    },
  }),
  usePropagationPreview: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useFrameworkCatalog: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [],
    loading: false,
  }),
}));

function makeMaster(
  overrides: Partial<MasterControlModel> = {}
): MasterControlModel {
  return new MasterControlModel({
    id: 42,
    title: "Encryption at rest",
    description: "All customer data encrypted with AES-256.",
    status: "Waiting" as MasterControlStatus,
    owner: 7,
    reviewer: null,
    approver: null,
    due_date: null,
    implementation_details: null,
    risk_review: null,
    is_demo: false,
    ...overrides,
  });
}

describe("DetailsTab save pipeline (E2E wire-up)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends only the changed fields as a sparse patch when the user edits the title", async () => {
    const master = makeMaster();
    mockUpdateMutateAsync.mockResolvedValue({
      master: { ...master, title: "Encryption at rest (updated)" },
      propagation: [],
    });

    renderWithProviders(<DetailsTab master={master} />);

    const titleInput = screen.getByDisplayValue("Encryption at rest");
    fireEvent.change(titleInput, {
      target: { value: "Encryption at rest (updated)" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 42,
      body: { title: "Encryption at rest (updated)" },
    });
  });

  it("does not call the update mutation when nothing changed", async () => {
    const master = makeMaster();
    renderWithProviders(<DetailsTab master={master} />);

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    // The controller skips the roundtrip when no field changed — surface a
    // "Saved." success state without hitting the mutation.
    await waitFor(() =>
      expect(screen.getByText(/Saved\./)).toBeInTheDocument()
    );
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message when the mutation fails", async () => {
    const master = makeMaster();
    mockUpdateMutateAsync.mockRejectedValue(
      new Error("Propagation failed for EU-AI-Act mapping 3")
    );

    renderWithProviders(<DetailsTab master={master} />);

    const titleInput = screen.getByDisplayValue("Encryption at rest");
    fireEvent.change(titleInput, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() =>
      expect(
        screen.getByText("Propagation failed for EU-AI-Act mapping 3")
      ).toBeInTheDocument()
    );
  });

  it("blocks saving when the title is cleared and surfaces a validation error", async () => {
    const master = makeMaster();
    renderWithProviders(<DetailsTab master={master} />);

    const titleInput = screen.getByDisplayValue("Encryption at rest");
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() =>
      expect(screen.getByText("Title is required.")).toBeInTheDocument()
    );
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("disables editing for demo master controls", () => {
    const demoMaster = makeMaster({ is_demo: true });
    renderWithProviders(<DetailsTab master={demoMaster} />);

    expect(
      screen.getByText("Demo master controls cannot be edited.")
    ).toBeInTheDocument();
  });
});
