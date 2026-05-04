import { vi } from "vitest";

vi.mock("../../Banner", () => ({
  default: ({ bannerText }: any) => <div data-testid="banner">{bannerText}</div>,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import DeleteAccountConfirmation from "../index";

describe("DeleteAccountConfirmation", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<DeleteAccountConfirmation open={true} onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
