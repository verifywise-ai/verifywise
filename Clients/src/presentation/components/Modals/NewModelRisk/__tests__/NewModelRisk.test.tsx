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
  default: (props: {
    date: { format: (f: string) => string } | null;
    isClearable?: boolean;
    handleDateChange: (value: null) => void;
  }) => (
    <div data-testid="datepicker" data-clearable={String(Boolean(props.isClearable))}>
      <span data-testid="review-date">
        {props.date ? props.date.format("YYYY-MM-DD") : "empty"}
      </span>
      <button type="button" onClick={() => props.handleDateChange(null)}>
        clear date
      </button>
    </div>
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
// Stable functions, as the real hook returns: the modal's effects depend on them.
vi.mock("../../../../../application/hooks/useFormValidation", () => {
  const validation = {
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    validateAll: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
    clearFieldError: vi.fn(),
    resetErrors: vi.fn(),
  };
  return { useFormValidation: () => validation };
});

import type { ComponentProps } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelRisk from "../index";

describe("NewModelRisk", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewModelRisk isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  // The review date is optional: a new risk has none, and a set one can be cleared.
  it("starts a new risk without a review date, in a clearable picker", () => {
    renderWithProviders(<NewModelRisk isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("review-date").textContent).toBe("empty");
    expect(screen.getByTestId("datepicker").dataset.clearable).toBe("true");
  });

  it("clears a stored review date", () => {
    renderWithProviders(
      <NewModelRisk
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        entityId={3}
        initialData={
          {
            risk_name: "Drift",
            risk_category: "Performance",
            likelihood: "Likely",
            severity: "Major",
            status: "Open",
            owner: "1",
            target_date: "2030-01-15",
            description: "",
            mitigation_plan: "",
            impact: "",
          } as unknown as ComponentProps<typeof NewModelRisk>["initialData"]
        }
      />,
    );
    expect(screen.getByTestId("review-date").textContent).toBe("2030-01-15");
    fireEvent.click(screen.getByText("clear date"));
    expect(screen.getByTestId("review-date").textContent).toBe("empty");
  });
});
