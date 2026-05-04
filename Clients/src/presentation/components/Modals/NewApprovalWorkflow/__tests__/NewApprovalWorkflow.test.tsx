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
vi.mock("../../../Inputs/AutoComplete", () => ({
  default: () => <div data-testid="autocomplete" />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CreateNewApprovalWorkflow from "../index";

describe("NewApprovalWorkflow", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<CreateNewApprovalWorkflow isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
