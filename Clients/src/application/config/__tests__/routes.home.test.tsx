import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../presentation/pages/StartHere", () => ({
  default: () => <div data-testid="start-here-page" />,
}));

type RouteProps = { path?: string; element?: ReactNode; children?: unknown };

/** Find the <Route> with this path anywhere in the tree createRoutes returns. */
function findRoute(node: unknown, path: string): ReactElement<RouteProps> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRoute(child, path);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<RouteProps>;
  if (el.props.path === path) return el;
  return el.props.children ? findRoute(el.props.children, path) : null;
}

/**
 * Load the routes (and react-router's Navigate from the same module registry)
 * with the look chosen. The look is read once at module load, so each load
 * resets the registry first.
 */
async function loadRoutes(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  const { createRoutes } = await import("../routes");
  const { Navigate } = await import("react-router");
  return { routes: createRoutes(false, () => {}), Navigate };
}

describe("Home routes", () => {
  afterEach(() => {
    window.localStorage.removeItem("vw-ui-style");
  });

  it("new look: /home is a route and /start-here redirects to its Get started tab", async () => {
    const { routes, Navigate } = await loadRoutes();
    expect(findRoute(routes, "/home")).not.toBeNull();

    const element = findRoute(routes, "/start-here")?.props.element as ReactElement<{
      to: string;
      replace?: boolean;
    }>;
    expect(element.type).toBe(Navigate);
    expect(element.props.to).toBe("/home?tab=get-started");
    expect(element.props.replace).toBe(true);
  }, 30_000);

  it("classic: /start-here still renders Start here, and /home still works", async () => {
    const { routes, Navigate } = await loadRoutes("classic");
    expect(findRoute(routes, "/home")).not.toBeNull();

    const element = findRoute(routes, "/start-here")?.props.element as ReactElement;
    expect(isValidElement(element)).toBe(true);
    expect(element.type).not.toBe(Navigate);
    // <Suspense><StartHere /></Suspense>: rendering it must land on Start here.
    render(element);
    expect(await screen.findByTestId("start-here-page")).toBeInTheDocument();
  }, 30_000);
});
