import { describe, expect, it } from "vitest";
import { BASELINE_I18N_MODULES, modulesForPath } from "../routeModules";

describe("modulesForPath", () => {
  it("always includes the baseline modules", () => {
    const names = modulesForPath("/tasks");
    for (const baseline of BASELINE_I18N_MODULES) {
      expect(names).toContain(baseline);
    }
  });

  it("maps area routes to their dictionary modules", () => {
    expect(modulesForPath("/evals/abc")).toEqual(
      expect.arrayContaining(["evals", ...BASELINE_I18N_MODULES]),
    );
    expect(modulesForPath("/ai-gateway/mcp/servers")).toEqual(
      expect.arrayContaining(["aiGateway", "mcpServers", ...BASELINE_I18N_MODULES]),
    );
    expect(modulesForPath("/model-inventory/models/1")).toEqual(
      expect.arrayContaining(["modelInventory", ...BASELINE_I18N_MODULES]),
    );
    expect(modulesForPath("/risk-inheritance")).toEqual(
      expect.arrayContaining(["riskManagement", ...BASELINE_I18N_MODULES]),
    );
    expect(modulesForPath("/login")).toEqual(
      expect.arrayContaining(["authentication", ...BASELINE_I18N_MODULES]),
    );
  });

  it("prefers the longest matching prefix", () => {
    const names = modulesForPath("/ai-gateway/mcp/tools");
    expect(names).toContain("mcpServers");
    expect(names).toContain("aiGateway");
  });

  it("loads intake modules for the public intake URL shape", () => {
    expect(modulesForPath("/abc123/use-case-form-intake")).toEqual(
      expect.arrayContaining([
        "useCases",
        "intakeLiveChecks",
        "intakeLogic",
        "intakePreview",
        ...BASELINE_I18N_MODULES,
      ]),
    );
  });

  it("treats the dashboard root as home chrome", () => {
    expect(modulesForPath("/")).toEqual(
      expect.arrayContaining(["dashboard", "homeQueue", "startHere", ...BASELINE_I18N_MODULES]),
    );
  });

  it("deduplicates module ids", () => {
    const names = modulesForPath("/home");
    expect(names).toEqual([...new Set(names)]);
  });
});
