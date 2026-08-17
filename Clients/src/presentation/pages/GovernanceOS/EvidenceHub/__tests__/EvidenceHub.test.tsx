import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import EvidenceHub from "../index";

describe("EvidenceHub", () => {
  it("renders the coming soon message inside the governance layout", () => {
    renderWithProviders(<EvidenceHub />, { route: "/governance/evidence" });

    expect(screen.getAllByText("Evidence Hub").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Coming soon — automated evidence collection and centralized storage."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Evidence Hub will connect to your existing evidence sources/),
    ).toBeInTheDocument();
  });

  it("marks the evidence tab as active", () => {
    renderWithProviders(<EvidenceHub />, { route: "/governance/evidence" });

    const tab = screen.getByRole("tab", { name: /Evidence Hub/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
