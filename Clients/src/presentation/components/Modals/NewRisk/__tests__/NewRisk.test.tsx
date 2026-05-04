import { vi } from "vitest";

vi.mock("../../../AddNewRiskForm", () => ({
  default: () => <div data-testid="risk-form" />,
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewRisk from "../index";

describe("NewRisk (AddNewRisk)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} />);
    expect(document.body).toBeTruthy();
  });
});
