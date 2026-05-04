import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Breadcrumbs } from "../index";

// Mock the routeMapping module
vi.mock("../routeMapping", () => ({
  getRouteMapping: (path: string) => {
    const map: Record<string, string> = {
      "/projects": "Projects",
      "/projects/details": "Details",
      "/settings": "Settings",
    };
    // Default: capitalize last segment
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "Home";
    return map[path] || last.charAt(0).toUpperCase() + last.slice(1);
  },
  getRouteIcon: () => null,
}));

describe("Breadcrumbs", () => {
  it("renders breadcrumb items from props", () => {
    const items = [
      { label: "Home", path: "/" },
      { label: "Projects", path: "/projects" },
      { label: "Details" },
    ];

    renderWithProviders(<Breadcrumbs items={items} />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("renders nothing when items array is empty", () => {
    const { container } = renderWithProviders(<Breadcrumbs items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders auto-generated breadcrumbs from route", () => {
    renderWithProviders(<Breadcrumbs autoGenerate />, {
      route: "/projects/details",
    });

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("renders the navigation aria label", () => {
    const items = [{ label: "Home", path: "/" }];
    renderWithProviders(<Breadcrumbs items={items} />);

    expect(screen.getByLabelText("Page navigation breadcrumbs")).toBeInTheDocument();
  });

  it("truncates long labels when truncateLabels is true", () => {
    const items = [
      {
        label: "This is a very long breadcrumb label that should be truncated",
        path: "/long",
      },
    ];

    renderWithProviders(<Breadcrumbs items={items} truncateLabels maxLabelLength={10} />);

    expect(screen.getByText("This is a ...")).toBeInTheDocument();
  });

  it("does not truncate labels when truncateLabels is false", () => {
    const longLabel = "This is a very long breadcrumb label";
    const items = [{ label: longLabel, path: "/long" }];

    renderWithProviders(<Breadcrumbs items={items} truncateLabels={false} />);

    expect(screen.getByText(longLabel)).toBeInTheDocument();
  });

  it("marks the last item as the current page", () => {
    const items = [{ label: "Home", path: "/" }, { label: "Current Page" }];

    renderWithProviders(<Breadcrumbs items={items} />);

    const currentPage = screen.getByText("Current Page").closest("[aria-current]");
    expect(currentPage).toHaveAttribute("aria-current", "page");
  });
});
