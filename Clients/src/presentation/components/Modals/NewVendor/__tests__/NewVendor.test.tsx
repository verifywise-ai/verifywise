import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createMutateAsync, updateMutateAsync, refetchProjects, projects } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  refetchProjects: vi.fn(),
  projects: [
    { id: 1, project_title: "Alpha", approval_status: "approved" },
    { id: 2, project_title: "Beta", approval_status: "pending", has_pending_approval: true },
    { id: 3, project_title: "Gamma", approval_status: "rejected" },
    { id: 4, project_title: "Delta" },
  ],
}));

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title, onSubmit, submitButtonText, isSubmitting }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
        {onSubmit && (
          <button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {submitButtonText}
          </button>
        )}
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input aria-label={props.label} value={props.value ?? ""} onChange={props.onChange} />
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => (
    <select aria-label={props.label} value={props.value ?? ""} onChange={props.onChange}>
      <option value="">-</option>
      {(props.items ?? []).map((item: any) => (
        <option key={item._id} value={item._id}>
          {item.name}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("../../../Inputs/Datepicker", async () => {
  const dayjs = (await import("dayjs")).default;
  return {
    default: (props: any) => (
      <div>
        <span data-testid="review-date">
          {props.date ? props.date.format("YYYY-MM-DD") : "empty"}
        </span>
        <button type="button" onClick={() => props.handleDateChange(dayjs("2026-12-01T09:00:00"))}>
          pick date
        </button>
        <button type="button" onClick={() => props.handleDateChange(null)}>
          clear date
        </button>
      </div>
    ),
  };
});
// Chips by label, each with a remove button, and an "add" button per option.
vi.mock("../../../Inputs/Autocomplete", () => ({
  default: (props: any) => (
    <div data-testid="use-cases">
      {props.value.map((option: any) => (
        <span key={option._id} data-testid="use-case-chip">
          {props.getOptionLabel(option)}
          <button
            type="button"
            aria-label={`remove ${option._id}`}
            onClick={() =>
              props.onChange(
                {},
                props.value.filter((o: any) => o._id !== option._id),
              )
            }
          />
        </span>
      ))}
      {props.options
        .filter((option: any) => !props.value.some((o: any) => o._id === option._id))
        .map((option: any) => (
          <button
            key={option._id}
            type="button"
            onClick={() => props.onChange({}, [...props.value, option])}
          >
            add {option.name}
          </button>
        ))}
    </div>
  ),
}));
vi.mock("../../../CustomFieldsSection", () => ({
  default: () => null,
}));
vi.mock("../../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({ blocked: false, onPendingChange: vi.fn() }),
}));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCanCheck: () => () => true,
}));
vi.mock("../../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({ history: [], loading: false }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    data: projects,
    approvedProjects: projects.filter(
      (p: any) =>
        !p.has_pending_approval &&
        p.approval_status !== "pending" &&
        p.approval_status !== "rejected",
    ),
    refetch: refetchProjects,
  }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 5, name: "Ana", surname: "Lee" }] }),
}));
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useCreateVendor: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateVendor: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewVendor from "../index";

const fillNewVendor = async () => {
  await userEvent.type(screen.getByLabelText("Vendor name"), "Acme");
  await userEvent.type(screen.getByLabelText("Website"), "acme.test");
  await userEvent.type(screen.getByLabelText("Vendor contact person"), "Jo Smith");
  await userEvent.type(screen.getByLabelText("What does the vendor provide?"), "Hosting");
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "5");
  await userEvent.click(screen.getByRole("button", { name: "add Alpha" }));
};

const existingVendor = {
  id: 9,
  vendor_name: "Acme",
  vendor_provides: "Hosting",
  assignee: 5,
  website: "http://acme.test",
  vendor_contact_person: "Jo Smith",
  review_result: "",
  review_status: "Not started",
  reviewer: 5,
  review_date: "2026-11-30T12:00:00.000Z",
  projects: [1, 2, 3],
} as any;

describe("NewVendor (AddNewVendor)", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    refetchProjects.mockReset();
  });

  it("renders without crashing when open", () => {
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
  });

  // VC-H1: a failed save used to empty the form in its finally block.
  it("keeps what the user typed when the save fails", async () => {
    createMutateAsync.mockRejectedValue(new Error("Server down"));
    const setIsOpen = vi.fn();
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={setIsOpen} onSuccess={vi.fn()} />);

    await fillNewVendor();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    expect(screen.getByLabelText("Vendor name")).toHaveValue("Acme");
    expect(screen.getByLabelText("Website")).toHaveValue("acme.test");
    expect(screen.getByLabelText("Assignee")).toHaveValue("5");
    expect(screen.getAllByTestId("use-case-chip").map((chip) => chip.textContent)).toEqual([
      "Alpha",
    ]);
    expect(setIsOpen).not.toHaveBeenCalledWith(false);
  });

  // Decision 10: no review date unless one is picked.
  it("starts with an empty review date and sends none", async () => {
    createMutateAsync.mockResolvedValue({ status: 201, data: { data: { id: 11 } } });
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByTestId("review-date")).toHaveTextContent("empty");
    await fillNewVendor();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ review_date: null, projects: [1] });
  });

  it("sends a picked review date as that day at noon UTC", async () => {
    createMutateAsync.mockResolvedValue({ status: 201, data: { data: { id: 11 } } });
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);

    await fillNewVendor();
    await userEvent.click(screen.getByRole("button", { name: "pick date" }));
    expect(screen.getByTestId("review-date")).toHaveTextContent("2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0].review_date).toBe("2026-12-01T12:00:00.000Z");
  });

  it("clears a stored review date", async () => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    renderWithProviders(
      <AddNewVendor
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        existingVendor={existingVendor}
      />,
    );

    expect(screen.getByTestId("review-date")).toHaveTextContent("2026-11-30");
    await userEvent.click(screen.getByRole("button", { name: "clear date" }));
    expect(screen.getByTestId("review-date")).toHaveTextContent("empty");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync.mock.calls[0][0]).toMatchObject({
      id: 9,
      data: { review_date: null },
    });
  });

  // VC-M7 / decision 13: links to pending or rejected use cases stay.
  it("shows links to pending and rejected use cases with their status and saves them", async () => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    renderWithProviders(
      <AddNewVendor
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        existingVendor={existingVendor}
      />,
    );

    expect(screen.getAllByTestId("use-case-chip").map((chip) => chip.textContent)).toEqual([
      "Alpha",
      "Beta (Pending approval)",
      "Gamma (Rejected)",
    ]);
    // New links come from approved use cases only.
    expect(screen.getByRole("button", { name: "add Delta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add (Beta|Gamma)/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "add Delta" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect([...updateMutateAsync.mock.calls[0][0].data.projects].sort()).toEqual([1, 2, 3, 4]);
  });

  it("drops a pending link only when the user removes it", async () => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    renderWithProviders(
      <AddNewVendor
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        existingVendor={existingVendor}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "remove 2" }));
    // A removed pending use case can't be picked again as a new link.
    expect(screen.queryByRole("button", { name: "add Beta" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect([...updateMutateAsync.mock.calls[0][0].data.projects].sort()).toEqual([1, 3]);
  });

  it("keeps links to use cases the user can't see", async () => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    renderWithProviders(
      <AddNewVendor
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={vi.fn()}
        existingVendor={{ ...existingVendor, projects: [1, 99] }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "add Delta" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect([...updateMutateAsync.mock.calls[0][0].data.projects].sort((a, b) => a - b)).toEqual([
      1, 4, 99,
    ]);
  });

  it("fetches the use cases again each time it opens", () => {
    const { rerender } = renderWithProviders(
      <AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(refetchProjects).toHaveBeenCalledTimes(1);

    rerender(<AddNewVendor isOpen={false} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    rerender(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(refetchProjects).toHaveBeenCalledTimes(2);
  });
});
