import { vi, describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children }: any) =>
    isOpen ? <div data-testid="standard-modal">{children}</div> : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input id={props.id} data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
// A native select, so a test can pick a value and read the selected one.
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => (
    <select
      data-testid={`select-${props.id || "select"}`}
      value={props.value ?? ""}
      onChange={props.onChange}
    >
      <option value="" />
      {(props.items ?? []).map((item: any) => (
        <option key={item._id} value={item._id} disabled={item.disabled}>
          {item.name}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("../../../Inputs/Toggle", () => ({
  default: () => <div data-testid="toggle" />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  HistorySidebar: () => null,
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({
    data: [
      { id: 1, name: "Ed", surname: "Itor", email: "ed@x.test" },
      { id: 2, name: "Ann", surname: "Prover", email: "ann@x.test" },
    ],
  }),
}));
// A non-Admin editor (user 1).
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCanCheck: () => (key: string) => key !== "organization.admin",
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelInventory from "../index";

const statusSelect = () => screen.getByTestId("select-status") as HTMLSelectElement;

describe("NewModelInventory approval rule", () => {
  it("resets a decision to Pending when a non-Admin names an approver", async () => {
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );
    fireEvent.change(statusSelect(), { target: { value: "Approved" } });
    expect(statusSelect().value).toBe("Approved");

    await waitFor(() => expect(screen.getByText("Ann Prover")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("select-approver"), { target: { value: "2" } });

    await waitFor(() => expect(statusSelect().value).toBe("Pending"));
    const approved = Array.from(statusSelect().options).find((o) => o.value === "Approved");
    expect(approved?.disabled).toBe(true);
  });

  it("does not let a non-Admin pick themself as approver", async () => {
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );
    await waitFor(() => expect(screen.getByText("Ed Itor")).toBeInTheDocument());
    const self = Array.from(
      (screen.getByTestId("select-approver") as HTMLSelectElement).options,
    ).find((o) => o.value === "1");
    expect(self?.disabled).toBe(true);
  });

  it("moves an Approved model with no approver to Pending when a non-Admin names one", async () => {
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit={true}
        selectedModelInventoryId={7}
        initialData={
          {
            provider: "OpenAI",
            model: "GPT-4",
            version: "1",
            approver: "",
            status: "Approved",
            status_date: "2026-09-01",
            projects: [],
            frameworks: [],
            capabilities: [],
          } as any
        }
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );
    expect(statusSelect().value).toBe("Approved");
    await waitFor(() => expect(screen.getByText("Ann Prover")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("select-approver"), { target: { value: "2" } });
    await waitFor(() => expect(statusSelect().value).toBe("Pending"));
  });
});
