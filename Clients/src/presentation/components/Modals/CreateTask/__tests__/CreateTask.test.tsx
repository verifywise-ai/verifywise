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
vi.mock("../../../Inputs/ChipInput", () => ({
  default: () => <div data-testid="chip-input" />,
}));
vi.mock("../../../EntityLinkSelector", () => ({
  default: () => <div data-testid="entity-link-selector" />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
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

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CreateTask from "../index";

describe("CreateTask", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<CreateTask isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
