import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import UpdateBanner from "../index";

describe("UpdateBanner", () => {
  it("renders the update message", () => {
    renderWithProviders(<UpdateBanner />);
    expect(screen.getByText("A new version of VerifyWise is available")).toBeInTheDocument();
  });

  it("renders the Update now button", () => {
    renderWithProviders(<UpdateBanner />);
    expect(screen.getByRole("button", { name: /update now/i })).toBeInTheDocument();
  });

  it("has role=alert for accessibility", () => {
    renderWithProviders(<UpdateBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
