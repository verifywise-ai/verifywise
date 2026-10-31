import { describe, it, expect } from "vitest";
import { getAppModuleFromPath } from "../appModule";

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
