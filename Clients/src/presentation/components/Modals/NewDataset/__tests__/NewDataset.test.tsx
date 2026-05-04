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
vi.mock("../../../Inputs/Toggle", () => ({
  default: () => <div data-testid="toggle" />,
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
    resetErrors: vi.fn(),
  }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewDataset from "../index";

describe("NewDataset", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewDataset isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
