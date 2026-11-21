import { getRouteIcon, getRouteMapping } from "../routeMapping";

// The tabs of the Vendors page are paths of their own. A path under /vendors that is not listed is
// read as the page of one vendor, which is what the dynamic pattern is for.
describe("breadcrumbs of the Vendors page", () => {
  it.each([
    ["/vendors", "Vendor management"],
    ["/vendors/risks", "Vendor risks"],
    ["/vendors/research-findings", "Research findings"],
    ["/vendors/insights", "Insights"],
  ])("names %s %s", (path, label) => {
    expect(getRouteMapping(path)).toBe(label);
  });

  it("still calls a path of one vendor 'Vendor details'", () => {
    expect(getRouteMapping("/vendors/some-vendor")).toBe("Vendor details");
  });

  it.each(["/vendors", "/vendors/risks", "/vendors/research-findings", "/vendors/insights"])(
    "gives %s an icon",
    (path) => {
      expect(getRouteIcon(path)).not.toBeNull();
    },
  );
});
