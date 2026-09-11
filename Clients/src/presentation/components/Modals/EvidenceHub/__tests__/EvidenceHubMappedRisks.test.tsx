/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";

vi.mock("../../StepperModal", () => ({
  default: ({ children, onNext, onBack, onSubmit }: any) => (
    <div data-testid="stepper-modal">
      {children}
      <button onClick={onNext}>Next</button>
      <button onClick={onBack}>Back</button>
      <button onClick={onSubmit}>Save</button>
    </div>
  ),
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../FileManagerUpload", () => ({
  default: () => null,
}));
vi.mock("../../../Inputs/Select/Multi", () => ({
  default: (props: any) => (
    <div>
      <label>{props.label}</label>
      <select
        data-testid={`multi-select-${props.label}`}
        multiple
        value={(props.value || []).map(String)}
        onChange={(e: any) => {
          const selected = Array.from(e.target.selectedOptions).map((o: any) =>
            Number((o as HTMLOptionElement).value),
          );
          props.onChange({ target: { value: selected } });
        }}
      >
        {(props.items || []).map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { getAllEntities } from "../../../../../application/repository/entity.repository";
import NewEvidenceHub from "../index";

const mockGetAll = getAllEntities as unknown as ReturnType<typeof vi.fn>;

const initialData = {
  evidence_name: "SOC 2 report",
  evidence_type: "Certification",
  description: "Vendor report",
  evidence_files: [
    {
      id: 1,
      filename: "soc2.pdf",
      size: 100,
      mimetype: "application/pdf",
      uploaded_by: 1,
      upload_date: "2026-09-01",
    },
  ],
  mapped_model_ids: [],
  mapped_risk_ids: [7],
  tags: [],
  framework_ids: [],
  reviewer_id: null,
  retention_policy: null,
  expiry_date: null,
};

describe("EvidenceHub mapped risks", () => {
  beforeEach(() => {
    mockGetAll.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/projectRisks") {
        return {
          data: [
            { id: 7, risk_name: "Risk Seven" },
            { id: 8, risk_name: "Risk Eight" },
          ],
        };
      }
      return { data: [] };
    });
  });

  it("round-trips the Mapped risks value through save", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <NewEvidenceHub isOpen={true} setIsOpen={vi.fn()} onSuccess={onSuccess} initialData={initialData as any} />,
    );

    // Walk the wizard to step 3 ("Frameworks & models").
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Next"));
    }

    const select = await screen.findByTestId("multi-select-Mapped risks");
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(2);
    // Saved mapping arrives pre-selected.
    expect((options[0] as HTMLOptionElement).selected).toBe(true);
    expect((options[1] as HTMLOptionElement).selected).toBe(false);

    // Extend the mapping, then save.
    (options[1] as HTMLOptionElement).selected = true;
    fireEvent.change(select);
    fireEvent.click(screen.getByText("Save"));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ mapped_risk_ids: [7, 8] });
  });
});
