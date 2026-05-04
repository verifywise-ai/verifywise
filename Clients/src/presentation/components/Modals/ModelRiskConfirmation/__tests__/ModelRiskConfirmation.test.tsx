import { vi } from "vitest";

vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ModelRiskConfirmation from "../index";

describe("ModelRiskConfirmation", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <ModelRiskConfirmation
        isOpen={true}
        setIsOpen={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
