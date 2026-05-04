import { vi } from "vitest";

vi.mock("../../Search", () => ({
  SearchBox: ({ onChange }: any) => <input data-testid="search-box" onChange={onChange} />,
}));
vi.mock("../../Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
  FilterCondition: {},
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TabFilterBar } from "../TabFilterBar";

describe("TabFilterBar", () => {
  it("renders without crashing", () => {
    renderWithProviders(<TabFilterBar />);
    expect(document.body).toBeTruthy();
  });

  it("renders search bar when showSearchBar is true", () => {
    renderWithProviders(
      <TabFilterBar showSearchBar={true} searchTerm="" setSearchTerm={vi.fn()} />,
    );
    expect(screen.getByTestId("search-box")).toBeInTheDocument();
  });
});
