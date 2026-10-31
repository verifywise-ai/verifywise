/**
 * The vendor risk form opened on a risk someone else drafted (a finding of the research agent).
 *
 * The form starts from the draft, with every required field filled and the vendor fixed, and
 * Save hands what is on screen to the draft's owner instead of creating a risk. Nothing is created
 * until Save, and nothing is lost when the owner's save fails.
 */

import { forwardRef, useImperativeHandle } from "react";
import { vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../AddNewRiskForm", () => ({
  default: () => <div data-testid="risk-form" />,
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 4, name: "Ada", surname: "Lovelace" },
      { id: 9, name: "Grace", surname: "Hopper" },
    ],
  }),
}));
vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    allFrameworks: [
      { id: 11, name: "ISO 27001", is_organizational: true },
      { id: 12, name: "SOC 2", is_organizational: true },
    ],
    loading: false,
  }),
}));
// A role the legacy vendor list does not know: the draft's owner has checked the permission.
const auth = vi.hoisted(() => ({ role: "Admin" }));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: auth.role, userId: 4 }),
}));
const saves = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../../../../application/hooks/useVendorRiskMutations", () => ({
  useCreateVendorRisk: () => ({ mutateAsync: saves.create }),
  useUpdateVendorRisk: () => ({ mutateAsync: saves.update }),
}));
vi.mock("../../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({
    blocked: false,
    reason: null,
    missingLabels: [],
    onPendingChange: vi.fn(),
  }),
}));
// The custom fields have their own tests; here only what the form does with them matters.
const customFields = vi.hoisted(() => ({ pending: false, flush: vi.fn() }));
vi.mock("../../../CustomFieldsSection", () => ({
  default: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    useImperativeHandle(ref, () => ({
      hasPendingValues: () => customFields.pending,
      flush: customFields.flush,
    }));
    return null;
  }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewRisk from "../index";
import type { VendorRiskPreview } from "../../../../../domain/interfaces/i.vendor";

const VENDORS = [
  { id: 3, vendor_name: "Acme Cloud" },
  { id: 8, vendor_name: "Zeta Labs" },
];

const TEXTS = {
  risk: "Customer data was exposed in a breach",
  impact: "Personal data of our customers could be exposed",
  plan: "Ask the vendor for its incident report",
};

const previewOf = (
  overrides: Partial<VendorRiskPreview> = {},
  values: Partial<VendorRiskPreview["values"]> = {},
): VendorRiskPreview => ({
  key: 1,
  title: "Review suggested risk",
  description: "Suggested by the research agent. Check the details, then save.",
  values: {
    vendor_id: 3,
    risk_description: TEXTS.risk,
    impact_description: TEXTS.impact,
    action_plan: TEXTS.plan,
    likelihood: "Likely",
    risk_severity: "Major",
    action_owner: 4,
    ...values,
  },
  onSave: vi.fn().mockResolvedValue(77),
  ...overrides,
});

const renderForm = (preview: VendorRiskPreview, props: { setIsOpen?: () => void } = {}) => {
  const setIsOpen = props.setIsOpen ?? vi.fn();
  const onSuccess = vi.fn();
  const view = renderWithProviders(
    <AddNewRisk
      isOpen={true}
      setIsOpen={setIsOpen}
      onSuccess={onSuccess}
      vendors={VENDORS}
      preview={preview}
    />,
  );
  return { ...view, setIsOpen, onSuccess };
};

/** The text of a labelled select, as the person sees it. */
const selected = (label: string) => {
  const select = screen
    .getAllByText(label)
    .map((node) => node.closest(".select-wrapper"))
    .find((wrapper): wrapper is HTMLElement => wrapper instanceof HTMLElement);
  return within(select as HTMLElement).getByRole("combobox").textContent;
};

const comboboxOf = (label: string) =>
  within(screen.getAllByText(label)[0].closest(".select-wrapper") as HTMLElement).getByRole(
    "combobox",
  );

/** Opens the select with this label and picks the option. */
const choose = async (label: string, option: string) => {
  await userEvent.click(comboboxOf(label));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

const clickSave = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
  auth.role = "Admin";
  saves.create.mockReset();
  saves.update.mockReset();
  customFields.pending = false;
  customFields.flush.mockReset();
  // jsdom does not implement scrollIntoView, which a failed save calls on its way to the first
  // invalid field.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("the vendor risk form opened on a preview", () => {
  it("shows the title and the description of the preview", () => {
    renderForm(previewOf());

    expect(screen.getByText("Review suggested risk")).toBeInTheDocument();
    expect(
      screen.getByText("Suggested by the research agent. Check the details, then save."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Add a new vendor risk")).not.toBeInTheDocument();
  });

  it("starts with every required field filled in from the draft", () => {
    renderForm(previewOf());

    expect(screen.getByDisplayValue(TEXTS.risk)).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEXTS.impact)).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEXTS.plan)).toBeInTheDocument();
    expect(selected("Vendor")).toBe("Acme Cloud");
    expect(selected("Action owner")).toBe("Ada Lovelace");
    expect(selected("Likelihood")).toBe("Likely");
    expect(selected("Risk severity")).toBe("Major");
  });

  it("fixes the vendor, which belongs to the draft", () => {
    renderForm(previewOf());

    const vendor = within(
      screen.getAllByText("Vendor")[0].closest(".select-wrapper") as HTMLElement,
    ).getByRole("combobox");
    expect(vendor).toHaveAttribute("aria-disabled", "true");
    // The rest of the form is open to editing.
    const owner = within(
      screen.getAllByText("Action owner")[0].closest(".select-wrapper") as HTMLElement,
    ).getByRole("combobox");
    expect(owner).not.toHaveAttribute("aria-disabled", "true");
  });

  it("saves through the owner of the draft with what is on screen, and creates nothing itself", async () => {
    const preview = previewOf();
    const { setIsOpen, onSuccess } = renderForm(preview);

    const description = screen.getByDisplayValue(TEXTS.risk);
    await userEvent.clear(description);
    await userEvent.type(description, "A breach exposed customer records");
    await clickSave();

    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(1));
    expect(preview.onSave).toHaveBeenCalledWith({
      vendor_id: 3,
      risk_description: "A breach exposed customer records",
      impact_description: TEXTS.impact,
      action_owner: "4",
      action_plan: TEXTS.plan,
      risk_severity: "Major",
      // The level the form works out for Likely and Major, as it does for any risk it saves.
      risk_level: "High risk",
      likelihood: "Likely",
      frameworks: [],
    });
    expect(saves.create).not.toHaveBeenCalled();
    expect(saves.update).not.toHaveBeenCalled();
    await waitFor(() => expect(setIsOpen).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // The owner of the draft tells the person it worked: the form adds no toast of its own.
    expect(screen.queryByText("Vendor-Risk created successfully")).not.toBeInTheDocument();
  });

  it("reads the register's top likelihood, which has a small c, and writes it back the same way", async () => {
    const preview = previewOf({}, { likelihood: "Almost certain", risk_severity: "Catastrophic" });
    renderForm(preview);

    // The form's list spells it with a capital C.
    expect(selected("Likelihood")).toBe("Almost Certain");

    await clickSave();

    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(1));
    expect(preview.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        likelihood: "Almost certain",
        risk_severity: "Catastrophic",
        risk_level: "Very high risk",
      }),
    );
  });

  it("sends the frameworks the person picked", async () => {
    const preview = previewOf();
    renderForm(preview);

    await userEvent.click(screen.getByPlaceholderText("Select applicable frameworks"));
    await userEvent.click(await screen.findByRole("option", { name: "SOC 2" }));
    await clickSave();

    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(1));
    expect(preview.onSave).toHaveBeenCalledWith(expect.objectContaining({ frameworks: [12] }));
  });

  it("asks for an owner when the draft names none, and saves nothing until one is chosen", async () => {
    const preview = previewOf({}, { action_owner: null });
    renderForm(preview);

    await clickSave();

    expect(
      await screen.findByText("Please select an action owner from the dropdown"),
    ).toBeInTheDocument();
    expect(preview.onSave).not.toHaveBeenCalled();
  });

  it("refuses a field the person emptied, as it does for any risk", async () => {
    const preview = previewOf();
    renderForm(preview);

    await userEvent.clear(screen.getByDisplayValue(TEXTS.plan));
    await clickSave();

    expect(await screen.findByText(/Action plan/, { selector: "p, span, div" })).toBeVisible();
    expect(preview.onSave).not.toHaveBeenCalled();
  });

  it("stays open, with the edits in it, when the owner's save fails", async () => {
    const preview = previewOf({ onSave: vi.fn().mockRejectedValue(new Error("boom")) });
    const { setIsOpen, onSuccess } = renderForm(preview);

    const description = screen.getByDisplayValue(TEXTS.risk);
    await userEvent.clear(description);
    await userEvent.type(description, "My own wording");
    await clickSave();

    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(setIsOpen).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("My own wording")).toBeInTheDocument();

    // The person can save again.
    vi.mocked(preview.onSave).mockResolvedValueOnce(78);
    await clickSave();
    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(setIsOpen).toHaveBeenCalledTimes(1));
  });

  it("keeps an edit in progress when the page renders again with the same draft, and starts again for another", async () => {
    const first = previewOf();
    const { rerender } = renderForm(first);
    const description = screen.getByDisplayValue(TEXTS.risk);
    await userEvent.clear(description);
    await userEvent.type(description, "Half-written edit");

    // The same draft, as a new object (the page rendered again).
    rerender(
      <AddNewRisk
        isOpen={true}
        setIsOpen={vi.fn()}
        vendors={VENDORS}
        preview={previewOf({ key: 1 })}
      />,
    );
    expect(screen.getByDisplayValue("Half-written edit")).toBeInTheDocument();

    // Another draft replaces it.
    rerender(
      <AddNewRisk
        isOpen={true}
        setIsOpen={vi.fn()}
        vendors={VENDORS}
        preview={previewOf(
          { key: 2 },
          { risk_description: "A different finding", vendor_id: 8, likelihood: "Rare" },
        )}
      />,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("A different finding")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("Half-written edit")).not.toBeInTheDocument();
    expect(selected("Vendor")).toBe("Zeta Labs");
    expect(selected("Likelihood")).toBe("Rare");
  });

  it("does not close the form of another draft when an earlier save finishes", async () => {
    let finish!: (id: number) => void;
    const first = previewOf({
      onSave: vi.fn(() => new Promise<number>((resolve) => (finish = resolve))),
    });
    const setIsOpen = vi.fn();
    const onSuccess = vi.fn();
    const { rerender } = renderWithProviders(
      <AddNewRisk
        isOpen={true}
        setIsOpen={setIsOpen}
        onSuccess={onSuccess}
        vendors={VENDORS}
        preview={first}
      />,
    );
    await clickSave();
    await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1));

    // The person leaves the form and opens another finding while the first request is on its way.
    rerender(
      <AddNewRisk
        isOpen={true}
        setIsOpen={setIsOpen}
        onSuccess={onSuccess}
        vendors={VENDORS}
        preview={previewOf({ key: 2 }, { risk_description: "The second finding" })}
      />,
    );
    await waitFor(() => expect(screen.getByDisplayValue("The second finding")).toBeInTheDocument());

    await act(async () => finish(77));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(setIsOpen).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("The second finding")).toBeInTheDocument();
  });

  it("saves for a role the vendor list does not know, because the owner of the draft checked the permission", async () => {
    auth.role = "AI Engineer";
    const preview = previewOf();
    renderForm(preview);

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await clickSave();

    await waitFor(() => expect(preview.onSave).toHaveBeenCalledTimes(1));
  });

  describe("custom fields", () => {
    it("saves the custom field values the person staged to the new risk", async () => {
      customFields.pending = true;
      customFields.flush.mockResolvedValue(undefined);
      const preview = previewOf({ onSave: vi.fn().mockResolvedValue(77) });
      const { setIsOpen } = renderForm(preview);

      await clickSave();

      await waitFor(() => expect(customFields.flush).toHaveBeenCalledWith(77));
      await waitFor(() => expect(setIsOpen).toHaveBeenCalledTimes(1));
    });

    it("does not touch them when none were staged", async () => {
      const preview = previewOf();
      const { setIsOpen } = renderForm(preview);

      await clickSave();

      await waitFor(() => expect(setIsOpen).toHaveBeenCalledTimes(1));
      expect(customFields.flush).not.toHaveBeenCalled();
    });

    it("closes all the same when they could not be saved, and says so: the risk exists", async () => {
      customFields.pending = true;
      customFields.flush.mockRejectedValue(new Error("nope"));
      const preview = previewOf();
      const { setIsOpen, onSuccess } = renderForm(preview);

      await clickSave();

      await waitFor(() => expect(setIsOpen).toHaveBeenCalledTimes(1));
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText(
          "Risk added, but its custom field values could not be saved. Open the risk to try again.",
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("the vendor risk form without a preview", () => {
  it("is still locked for a role that may not edit vendors", () => {
    auth.role = "Reviewer";
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={VENDORS} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("writes the register's spelling of the top likelihood when it creates a risk", async () => {
    saves.create.mockResolvedValue({ status: 201, data: { data: { id: 5 } } });
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={VENDORS} />);

    await choose("Vendor", "Acme Cloud");
    await choose("Action owner", "Ada Lovelace");
    await userEvent.type(screen.getByLabelText(/Risk description/), "Outage");
    await userEvent.type(screen.getByLabelText(/Impact description/), "Loans stop");
    await userEvent.type(screen.getByLabelText(/Action plan/), "Second provider");
    await choose("Likelihood", "Almost Certain");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saves.create).toHaveBeenCalledTimes(1));
    expect(saves.create).toHaveBeenCalledWith(
      expect.objectContaining({ likelihood: "Almost certain" }),
    );
  });
});
