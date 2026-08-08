import { isValidElement, type ReactElement } from "react";
import { createRoutes } from "../routes";

/**
 * Recursively walk a Route element tree and collect every `path` prop.
 * createRoutes returns an array of <Route> elements; the dashboard route
 * nests its children as an array of <Route> elements under props.children.
 */
function collectPaths(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectPaths(child, acc));
    return acc;
  }
  if (isValidElement(node)) {
    const props = (node as ReactElement<{ path?: string; children?: unknown }>).props;
    if (typeof props.path === "string") {
      acc.push(props.path);
    }
    if (props.children) {
      collectPaths(props.children, acc);
    }
  }
  return acc;
}

describe("AI page routes", () => {
  it("registers the /ai-audit and /ai-observability routes", () => {
    const routes = createRoutes(false, () => {});
    const paths = collectPaths(routes);

    expect(paths).toContain("/ai-audit");
    expect(paths).toContain("/ai-observability");
  });
});
