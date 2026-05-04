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
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({ history: [], loading: false }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, roleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useCreateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewVendor from "../index";

describe("NewVendor (AddNewVendor)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
