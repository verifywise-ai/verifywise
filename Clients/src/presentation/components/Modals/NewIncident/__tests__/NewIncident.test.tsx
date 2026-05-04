import { vi } from "vitest";

vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import SideDrawerIncident from "../index";

describe("NewIncident (SideDrawerIncident)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
