import { vi } from "vitest";

vi.mock("../../DropDowns", () => ({
  default: () => <div data-testid="dropdowns" />,
}));
vi.mock("../../ComplianceFeedback/ComplianceFeedback", () => ({
  AuditorFeedback: () => <div data-testid="auditor-feedback" />,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CustomModal from "../index";

describe("Controlpane (CustomModal)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <CustomModal
        isOpen={true}
        setIsOpen={vi.fn()}
        title="Test Control"
        content="Test content"
        subControlTlts={[]}
        onConfirm={vi.fn()}
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
