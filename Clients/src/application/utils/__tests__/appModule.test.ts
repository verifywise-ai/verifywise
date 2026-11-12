import { describe, it, expect } from "vitest";
import { getAppModuleFromPath, isGlobalPath } from "../appModule";

describe("getAppModuleFromPath", () => {
  it("maps root and governance routes to the main module", () => {
    expect(getAppModuleFromPath("/")).toBe("main");
    expect(getAppModuleFromPath("")).toBe("main");
    expect(getAppModuleFromPath("/intake-forms")).toBe("main");
    expect(getAppModuleFromPath("/projects")).toBe("main");
  });

  it("maps non-governance module prefixes to their modules", () => {
    expect(getAppModuleFromPath("/evals")).toBe("evals");
    expect(getAppModuleFromPath("/evals/some-project")).toBe("evals");
    expect(getAppModuleFromPath("/ai-gateway/dashboard")).toBe("ai-gateway");
    expect(getAppModuleFromPath("/ai-detection/scan")).toBe("ai-detection");
    expect(getAppModuleFromPath("/shadow-ai/insights")).toBe("shadow-ai");
    expect(getAppModuleFromPath("/ai-trust-index/browse")).toBe("ai-trust-index");
    expect(getAppModuleFromPath("/super-admin")).toBe("super-admin");
  });
});

describe("isGlobalPath", () => {
  it("matches Settings and Event tracker pages", () => {
    expect(isGlobalPath("/settings")).toBe(true);
    expect(isGlobalPath("/settings/organization")).toBe(true);
    expect(isGlobalPath("/event-tracker")).toBe(true);
    expect(isGlobalPath("/event-tracker/logs")).toBe(true);
  });

  it("does not match module pages or look-alike prefixes", () => {
    expect(isGlobalPath("/")).toBe(false);
    expect(isGlobalPath("/evals/settings")).toBe(false);
    expect(isGlobalPath("/shadow-ai/settings")).toBe(false);
    expect(isGlobalPath("/settingsx")).toBe(false);
    expect(isGlobalPath("/super-admin/settings")).toBe(false);
  });
});
