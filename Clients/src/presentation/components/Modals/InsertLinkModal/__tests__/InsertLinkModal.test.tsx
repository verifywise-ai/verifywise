import { vi } from "vitest";

vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children }: any) => <button>{children}</button>,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import InsertLinkModal from "../InsertLinkModal";

describe("InsertLinkModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<InsertLinkModal open={true} onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
