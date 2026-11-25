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
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
  }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelRisk from "../index";
import { SELECT_MIN_WIDTH } from "../../../Inputs/Select/constants";

describe("NewModelRisk", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewModelRisk isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("lets the owner, review date and model columns shrink to a select's minimum and wrap", () => {
    const { getByTestId } = renderWithProviders(<NewModelRisk isOpen={true} setIsOpen={vi.fn()} />);
    // The review date is the only date picker; its column's parent is the third row.
    const row = getByTestId("datepicker").parentElement!.parentElement!;
    expect(getComputedStyle(row).flexWrap).toBe("wrap");
    for (const column of Array.from(row.children)) {
      expect(getComputedStyle(column).minWidth).toBe(SELECT_MIN_WIDTH);
    }
  });
});
