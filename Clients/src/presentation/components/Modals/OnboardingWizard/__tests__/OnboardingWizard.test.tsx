import { vi } from "vitest";

vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import OnboardingWizard from "../index";

describe("OnboardingWizard", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <OnboardingWizard
        isOpen={true}
        onClose={vi.fn()}
        title="Welcome"
        steps={[{ label: "Step 1", content: <div>Content 1</div> }]}
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
