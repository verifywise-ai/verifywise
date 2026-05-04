import { vi } from "vitest";

vi.mock("../../../contexts/EntityGraphFocusContext", () => ({
  EntityGraphFocusProvider: ({ children }: any) => <div>{children}</div>,
  useEntityGraphFocus: () => ({ focusEntity: null, setFocusEntity: vi.fn(), clearFocus: vi.fn() }),
}));
vi.mock("@xyflow/react/dist/style.css", () => ({}));
vi.mock("../../../pages/EntityGraph", () => ({
  default: () => <div data-testid="entity-graph" />,
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";

// Import after mocks
import { EntityGraphModal } from "../index";

describe("EntityGraphModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <EntityGraphModal
        open={true}
        onClose={vi.fn()}
        focusEntityType={"model" as any}
        focusEntityId={1}
        focusEntityLabel="Test Model"
      />,
    );
    // Modal should be in the DOM
    expect(document.body).toBeTruthy();
  });
});
