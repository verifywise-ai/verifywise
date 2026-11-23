import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractRoutePatterns, routePatterns, stripRouteComments } from "../routePatterns";
import { isRegisteredRoute, resolveBreadcrumbPath } from "../resolveBreadcrumbPath";

const ROUTES_SOURCE = readFileSync(
  resolve(__dirname, "../../../../application/config/routes.tsx"),
  "utf8",
);

describe("extractRoutePatterns", () => {
  it("joins nested paths and ignores the catch-all and commented routes", () => {
    const source = `
      <Route path="/vendors" element={<Suspense><Vendors /></Suspense>}>
        <Route index element={<Vendors />} />
        <Route path="risks" element={<Vendors />} />
      </Route>
      <Route path="/setting" element={<Navigate to="/settings" replace />} />
      <Route path="/framework/:tab?" element={<Framework />} />
      <Route path="/governance-os/*" element={<Navigate to="/governance" replace />} />
      // <Route path="/public" element={<AITrustCentrePublic />} />
      <Route path="*" element={<PageNotFound />} />
    `;

    expect(extractRoutePatterns(source)).toEqual([
      "/vendors",
      "/vendors/risks",
      "/setting",
      "/framework/:tab?",
      "/governance-os/*",
    ]);
  });

  it("collects every path attribute in routes.tsx except the catch-all", () => {
    const declared = [...stripRouteComments(ROUTES_SOURCE).matchAll(/\bpath="([^"]*)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "*");

    const extracted = extractRoutePatterns(ROUTES_SOURCE);
    expect(extracted).toHaveLength(declared.length);
    expect(routePatterns).toEqual(extracted);
  });
});

describe("resolveBreadcrumbPath", () => {
  it("sends the missing /ai-detection/scans parent to scan history", () => {
    expect(isRegisteredRoute("/ai-detection/scans")).toBe(false);
    expect(resolveBreadcrumbPath("/ai-detection/scans")).toBe("/ai-detection/history");
  });

  it("keeps /ai-detection/scans/:scanId and other real routes under a claimed prefix", () => {
    expect(resolveBreadcrumbPath("/ai-detection/scans/42")).toBe("/ai-detection/scans/42");
    expect(resolveBreadcrumbPath("/ai-detection/scans/42/findings")).toBe(
      "/ai-detection/scans/42/findings",
    );
    expect(resolveBreadcrumbPath("/ai-detection")).toBe("/ai-detection");
    expect(resolveBreadcrumbPath("/ai-detection/history")).toBe("/ai-detection/history");
    expect(resolveBreadcrumbPath("/ai-detection/repositories")).toBe("/ai-detection/repositories");
    expect(resolveBreadcrumbPath("/ai-gateway/guardrails/pii")).toBe("/ai-gateway/guardrails/pii");
    expect(resolveBreadcrumbPath("/ai-gateway/mcp")).toBe("/ai-gateway/mcp");
    expect(resolveBreadcrumbPath("/ai-gateway/virtual-keys")).toBe("/ai-gateway/virtual-keys");
    expect(resolveBreadcrumbPath("/shadow-ai/tools/5")).toBe("/shadow-ai/tools/5");
    expect(resolveBreadcrumbPath("/shadow-ai")).toBe("/shadow-ai");
    expect(resolveBreadcrumbPath("/project-view")).toBe("/project-view");
    expect(resolveBreadcrumbPath("/start-here")).toBe("/start-here");
    expect(resolveBreadcrumbPath("/ai-trust-index/acme")).toBe("/ai-trust-index/acme");
    expect(resolveBreadcrumbPath("/vendors/risks")).toBe("/vendors/risks");
    expect(resolveBreadcrumbPath("/super-admin/organizations/9/users")).toBe(
      "/super-admin/organizations/9/users",
    );
  });

  it("leaves a path that no nav item claims on its own url", () => {
    expect(isRegisteredRoute("/no-such-page")).toBe(false);
    expect(resolveBreadcrumbPath("/no-such-page")).toBe("/no-such-page");
  });
});
