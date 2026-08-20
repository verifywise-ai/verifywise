import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RegulatoryRadar from "../index";

describe("RegulatoryRadar", () => {
  it("renders the coming soon message inside the governance layout", () => {
    renderWithProviders(<RegulatoryRadar />, { route: "/governance/regulatory-radar" });

    expect(screen.getAllByText("Regulatory Radar").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Coming soon — automated regulatory change monitoring."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Regulatory Radar will track changes to EU AI Act/),
    ).toBeInTheDocument();
  });

  it("marks the regulatory radar tab as active", () => {
    renderWithProviders(<RegulatoryRadar />, { route: "/governance/regulatory-radar" });

    const tab = screen.getByRole("tab", { name: /Regulatory Radar/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
