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
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../../../application/repository/approvalWorkflow.repository", () => ({
  getPendingApprovals: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RequestorApprovalModal from "../index";

describe("RequestorApprovalModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
