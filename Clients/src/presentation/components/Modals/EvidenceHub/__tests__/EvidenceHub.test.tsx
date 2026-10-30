import { vi } from "vitest";

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
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
vi.mock("../../../Inputs/CustomizableMultiSelect", () => ({
  default: () => <div data-testid="multi-select" />,
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
    resetErrors: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../Common/HistorySidebar", () => ({
  HistorySidebar: ({ entityType, entityId }: any) => (
    <div data-testid="history-sidebar">{`${entityType}:${entityId}`}</div>
  ),
}));

import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewEvidenceHub from "../index";

describe("EvidenceHub (NewEvidenceHub)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewEvidenceHub isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  // Activity used to be a sixth wizard step, which moved the Update button
  // off the Assignment step onto the read-only history (issue #4977 review).
  it("keeps five steps when editing and shows activity from a header toggle", () => {
    renderWithProviders(
      <NewEvidenceHub
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit={true}
        initialData={{ id: 12, evidence_name: "Policy", evidence_type: "Policy" } as any}
      />,
    );

    expect(screen.getByText("of", { exact: false }).parentElement?.textContent).toMatch(
      /Step\s*1\s*of\s*5/,
    );
    expect(screen.queryByTestId("history-sidebar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Activity history" }));

    expect(screen.getByTestId("history-sidebar").textContent).toBe("evidence_hub:12");
  });

  it("returns from the activity view to the same step when Next is pressed", () => {
    renderWithProviders(
      <NewEvidenceHub
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit={true}
        initialData={{ id: 12, evidence_name: "Policy", evidence_type: "Policy" } as any}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Activity history" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByTestId("history-sidebar")).toBeNull();
    expect(screen.getByText("of", { exact: false }).parentElement?.textContent).toMatch(
      /Step\s*1\s*of\s*5/,
    );
  });

  it("offers no activity toggle while adding new evidence", () => {
    renderWithProviders(<NewEvidenceHub isOpen={true} setIsOpen={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Activity history" })).toBeNull();
  });
});
