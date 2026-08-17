import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useGovernanceOs", () => ({
  useMappings: () => ({ data: [] }),
  useMappingsBetween: () => ({ data: [], isLoading: false }),
  useCreateMapping: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMapping: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMapping: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkCreateMappings: () => ({ mutate: vi.fn(), isPending: false }),
}));

import FrameworkMapperModule from "../index";

describe("FrameworkMapperModule", () => {
  it("renders the governance layout with the framework mapper title and content", () => {
    renderWithProviders(<FrameworkMapperModule />, { route: "/governance/framework-mapper" });

    expect(screen.getAllByText("Framework Mapper").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Explore cross-framework control mappings/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No mappings found for the selected frameworks and filters."),
    ).toBeInTheDocument();
  });

  it("marks the framework mapper tab as active", () => {
    renderWithProviders(<FrameworkMapperModule />, { route: "/governance/framework-mapper" });

    const tab = screen.getByRole("tab", { name: /Framework Mapper/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
