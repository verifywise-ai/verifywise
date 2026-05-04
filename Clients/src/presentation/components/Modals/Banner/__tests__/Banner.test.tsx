import { vi } from "vitest";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import Banner from "../index";

describe("Banner", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Banner onClose={vi.fn()} bannerText="Test banner" bannerWidth="100%" />);
    expect(document.body).toBeTruthy();
  });
});
