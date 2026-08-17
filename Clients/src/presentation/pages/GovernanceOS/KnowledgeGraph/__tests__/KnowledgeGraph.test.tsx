import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import KnowledgeGraph from "../index";

describe("KnowledgeGraph", () => {
  it("renders the coming soon message inside the governance layout", () => {
    renderWithProviders(<KnowledgeGraph />, { route: "/governance/knowledge-graph" });

    expect(screen.getAllByText("Knowledge Graph").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Coming soon — interactive visual graph of governance entities."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Knowledge Graph will render an interactive visualization/),
    ).toBeInTheDocument();
  });

  it("marks the knowledge graph tab as active", () => {
    renderWithProviders(<KnowledgeGraph />, { route: "/governance/knowledge-graph" });

    const tab = screen.getByRole("tab", { name: /Knowledge Graph/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
