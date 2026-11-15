import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { light } from "../../../../themes";
import LifecycleItemField from "../LifecycleItemField";
import type { LifecycleItem, LifecycleValue } from "../useModelLifecycle";

const api = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../../../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

// The current user's permission keys and id, set per test.
const auth = vi.hoisted(() => ({ keys: new Set<string>(), userId: 7 as number | null }));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => auth.keys.has(key),
  useCanCheck: () => (key: string) => auth.keys.has(key),
  usePermissionsSettled: () => true,
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: auth.userId }),
}));

function makeItem(
  item_type: LifecycleItem["item_type"],
  value: Partial<LifecycleValue> | null,
  config: Record<string, unknown> = {},
): LifecycleItem {
  return {
    id: 20,
    phase_id: 1,
    name: "Owner",
    item_type,
    is_required: false,
    display_order: 1,
    config,
    is_active: true,
    value: value
      ? ({ id: 5, model_inventory_id: 10, item_id: 20, ...value } as LifecycleValue)
      : null,
  };
}

function renderField(item: LifecycleItem) {
  return render(
    <ThemeProvider theme={light}>
      <LifecycleItemField modelId={10} item={item} onValueChanged={vi.fn()} />
    </ThemeProvider>,
  );
}

const approvals = [
  {
    id: 1,
    user_id: 7,
    status: "pending",
    decided_at: null,
    name: "Me",
    surname: "Self",
    email: "",
  },
  {
    id: 2,
    user_id: 8,
    status: "pending",
    decided_at: null,
    name: "Other",
    surname: "One",
    email: "",
  },
];

describe("LifecycleItemField without model.edit (Auditor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: [] } });
    auth.keys = new Set();
    auth.userId = 7;
  });

  it("shows a text answer as plain text, not an input", () => {
    renderField(makeItem("text", { value_text: "Fraud scoring" }));
    expect(screen.getByText("Fraud scoring")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows 'Not set' for an empty textarea", () => {
    renderField(makeItem("textarea", null));
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lists files without upload or remove controls", () => {
    const { container } = renderField(
      makeItem("documents", {
        files: [{ id: 1, value_id: 5, file_id: 99, filename: "card.pdf" }],
      }),
    );
    expect(screen.getByText("card.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove file" })).not.toBeInTheDocument();
    expect(screen.queryByText("Click to upload documents")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("lists people without add or remove controls", () => {
    renderField(
      makeItem("people", {
        people: [{ id: 1, user_id: 8, name: "Ada", surname: "Lovelace", email: "" }],
      } as any),
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(document.querySelector(".MuiChip-deleteIcon")).toBeNull();
  });

  it("disables the classification choices", () => {
    renderField(
      makeItem("classification", { value_json: { level: "High" } }, { levels: ["Low", "High"] }),
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    radios.forEach((r) => expect(r).toBeDisabled());
    expect(screen.getByRole("radio", { name: "High" })).toBeChecked();
  });

  it("disables the checklist and hides add and remove", () => {
    renderField(makeItem("checklist", { value_json: [{ label: "Bias test", checked: true }] }));
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Add checklist item...")).not.toBeInTheDocument();
  });

  it("hides add and remove approver, but keeps approve and reject on the user's own row", () => {
    renderField(makeItem("approval", { approvals } as any));
    expect(screen.queryByRole("button", { name: "Remove approver" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Approver" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(1);
  });
});

describe("LifecycleItemField approvals with model.edit (Editor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: [] } });
    auth.keys = new Set(["model.edit"]);
  });

  it("shows approve and reject only on the current user's row", () => {
    auth.userId = 7;
    renderField(makeItem("approval", { approvals } as any));

    const approve = screen.getAllByRole("button", { name: "Approve" });
    expect(approve).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(1);
    // The one set of buttons sits on the "Me Self" row.
    expect(approve[0].closest('[data-testid^="approver-row-"]')).toHaveTextContent("Me Self");
    // Editors still manage the approver list.
    expect(screen.getAllByRole("button", { name: "Remove approver" })).toHaveLength(2);
  });

  it("decides the user's own row with their own id", async () => {
    auth.userId = 7;
    api.put.mockResolvedValueOnce({ status: 200 });
    renderField(makeItem("approval", { approvals } as any));

    screen.getByRole("button", { name: "Approve" }).click();
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/extensions/model-lifecycle/models/10/lifecycle/items/20/approvals/7",
        { status: "approved" },
      ),
    );
  });

  it("shows no approve or reject when the user is not a named approver", () => {
    auth.userId = 42;
    renderField(makeItem("approval", { approvals } as any));
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("keeps text fields editable", () => {
    renderField(makeItem("text", { value_text: "Fraud scoring" }));
    expect(screen.getByRole("textbox")).toHaveValue("Fraud scoring");
  });
});
