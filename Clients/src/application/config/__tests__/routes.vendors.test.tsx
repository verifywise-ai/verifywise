import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { MemoryRouter, Routes, useLocation, useNavigate } from "react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutes } from "../routes";

// The Vendors page is shown on four paths, one per tab. Each tab is a route of its own so that a
// link, a reload and the notification of the assignee can open it. The page reads its tab from the
// path, so a path that is not a route here is a page that is not found.
const PAGE = "vendors-page";

vi.mock("../../../presentation/pages/Vendors", () => ({
  // The page holds state, and tells where the router is, like the real one that keeps its filters
  // and the heat map cell across its tabs.
  default: function VendorsPage() {
    const [count, setCount] = useState(0);
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <div data-testid={PAGE}>
        <span data-testid="path">{location.pathname}</span>
        <span data-testid="count">{count}</span>
        <button onClick={() => setCount((value) => value + 1)}>Count</button>
        {["/vendors", "/vendors/risks", "/vendors/research-findings", "/vendors/insights"].map(
          (path) => (
            <button key={path} onClick={() => navigate(path)}>
              {`Go to ${path}`}
            </button>
          ),
        )}
      </div>
    );
  },
}));

type RouteProps = { path?: string; index?: boolean; element?: ReactNode; children?: ReactNode };

/** The route element with this path, wherever it is nested in the route tree. */
function findRoute(node: unknown, path: string): ReactElement<RouteProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRoute(child, path);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<RouteProps>;
  if (element.props.path === path) return element;
  return findRoute(element.props.children, path);
}

/** The routes under a route, whatever else (a string between two of them) is among its children. */
const childRoutes = (route: ReactElement<RouteProps>): ReactElement<RouteProps>[] =>
  Children.toArray(route.props.children).filter(isValidElement) as ReactElement<RouteProps>[];

const vendorsRoute = () => {
  const route = findRoute(
    createRoutes(false, () => {}),
    "/vendors",
  );
  if (!route) throw new Error("There is no /vendors route.");
  return route;
};

describe("the routes of the Vendors page", () => {
  it("has a route for each tab under /vendors: the list, Risks, Research findings and Insights", () => {
    const children = childRoutes(vendorsRoute());

    expect(children.some((child) => child.props.index === true)).toBe(true);
    expect(children.map((child) => child.props.path).filter(Boolean)).toEqual([
      "risks",
      "research-findings",
      "insights",
    ]);
  });

  it("shows the Vendors page on every one of them, the one the parent shows", () => {
    const route = vendorsRoute();
    // <Suspense><Vendors /></Suspense>: the page is the same lazy component on every path.
    const pageOf = (element: ReactElement<RouteProps>) => {
      const suspense = element.props.element as ReactElement<{ children: ReactElement }>;
      return suspense.props.children.type;
    };

    for (const child of childRoutes(route)) {
      expect(pageOf(child)).toBe(pageOf(route));
    }
  });
});

describe("the page across the routes of its tabs", () => {
  // The page keeps what the person did (a use case chosen on one tab, the cell of the heat map)
  // while they move between its tabs, which only works while it is one mounted page. The parent
  // route shows it and has no outlet, so the child routes only make the paths match.
  const renderAt = async (path: string) => {
    const route = vendorsRoute();
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>{route}</Routes>
      </MemoryRouter>,
    );
    return screen.findByTestId(PAGE);
  };

  it.each(["/vendors", "/vendors/risks", "/vendors/research-findings", "/vendors/insights"])(
    "shows the page at %s",
    async (path) => {
      await renderAt(path);

      expect(screen.getByTestId("path")).toHaveTextContent(path);
      // One page, not the parent's and a child's.
      expect(screen.getAllByTestId(PAGE)).toHaveLength(1);
    },
  );

  it("keeps one page, with its state, as the person moves between the tabs", async () => {
    const page = await renderAt("/vendors");
    await userEvent.click(screen.getByText("Count"));
    await userEvent.click(screen.getByText("Count"));
    expect(screen.getByTestId("count")).toHaveTextContent("2");

    for (const path of [
      "/vendors/insights",
      "/vendors/risks",
      "/vendors/research-findings",
      "/vendors",
    ]) {
      await userEvent.click(screen.getByText(`Go to ${path}`));

      expect(screen.getByTestId("path")).toHaveTextContent(path);
      // The very same element, not a page that was mounted again with the same look.
      expect(screen.getByTestId(PAGE)).toBe(page);
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    }
  });

  it("keeps it when the tab is chosen again, and when a query string comes and goes", async () => {
    const page = await renderAt("/vendors/research-findings?findingsVendorId=7");
    await userEvent.click(screen.getByText("Count"));

    await userEvent.click(screen.getByText("Go to /vendors/research-findings"));
    await userEvent.click(screen.getByText("Go to /vendors/risks"));

    expect(screen.getByTestId(PAGE)).toBe(page);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
