import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Breadcrumbs } from "../index";

// Keep the small label map these tests were written against. Scan-detail
// paths use the real mapping so the visible label stays "Scan history".
vi.mock("../routeMapping", async () => {
  const actual = await vi.importActual<typeof import("../routeMapping")>("../routeMapping");
  const labels: Record<string, string> = {
    "/projects": "Projects",
    "/projects/details": "Details",
    "/settings": "Settings",
  };
  return {
    getRouteMapping: (path: string) => {
      if (labels[path]) return labels[path];
      if (path.startsWith("/ai-detection")) return actual.getRouteMapping(path);
      const segments = path.split("/").filter(Boolean);
      const last = segments[segments.length - 1] || "Home";
      return last.charAt(0).toUpperCase() + last.slice(1);
    },
    getRouteIcon: () => null,
  };
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

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

  it("shows only Home on /home, with no Dashboard root crumb", () => {
    renderWithProviders(<Breadcrumbs autoGenerate homeLabel="Dashboard" />, {
      route: "/home",
    });

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
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

  it("links /ai-detection/scans/:scanId to scan history", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Breadcrumbs autoGenerate />
        <LocationProbe />
      </>,
      { route: "/ai-detection/scans/42" },
    );

    expect(screen.getByText("AI detection")).toBeInTheDocument();
    expect(screen.getByText("Scan history")).toBeInTheDocument();
    expect(screen.getByText("Scan details")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Navigate to Scans" })).not.toBeInTheDocument();
    expect(screen.queryByText("Scans")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Navigate to Scan history" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/ai-detection/history");
  });

  it("marks the last item as the current page", () => {
    const items = [{ label: "Home", path: "/" }, { label: "Current Page" }];

    renderWithProviders(<Breadcrumbs items={items} />);

    const currentPage = screen.getByText("Current Page").closest("[aria-current]");
    expect(currentPage).toHaveAttribute("aria-current", "page");
  });
});
