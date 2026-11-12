import { describe, it, expect } from "vitest";
import { getCollection, getArticle } from "@user-guide-content/userGuideConfig";
import { GUIDE_ROUTE_RULES, getGuideTargetForLocation } from "../guideRouteMap";

describe("getGuideTargetForLocation", () => {
  it("every mapped target exists in the user guide", () => {
    const targets = GUIDE_ROUTE_RULES.flatMap((r) => [r.target, ...Object.values(r.byHash ?? {})]);
    targets.push("getting-started/dashboard");
    for (const target of targets) {
      const [collectionId, articleId] = target.split("/");
      expect(getCollection(collectionId), target).toBeDefined();
      if (articleId) expect(getArticle(collectionId, articleId), target).toBeDefined();
    }
  });

  it("opens the topic for the LLM Evals section in the hash", () => {
    expect(getGuideTargetForLocation("/evals/12", "#experiments")).toEqual({
      collectionId: "llm-evals",
      articleId: "running-experiments",
    });
    expect(getGuideTargetForLocation("/evals/12", "#arena")).toEqual({
      collectionId: "llm-evals",
      articleId: "llm-arena",
    });
  });

  it("falls back to the module page when no topic fits", () => {
    expect(getGuideTargetForLocation("/evals", "")).toEqual({ collectionId: "llm-evals" });
    expect(getGuideTargetForLocation("/evals/12", "#unknown")).toEqual({
      collectionId: "llm-evals",
    });
    expect(getGuideTargetForLocation("/ai-gateway/prompts")).toEqual({
      collectionId: "ai-gateway",
    });
  });

  it("prefers the most specific prefix", () => {
    expect(getGuideTargetForLocation("/ai-gateway/mcp/runs")).toEqual({
      collectionId: "ai-gateway",
      articleId: "mcp-runs",
    });
    expect(getGuideTargetForLocation("/model-inventory/model-risk-management/settings/x")).toEqual({
      collectionId: "ai-governance",
      articleId: "mrm",
    });
  });

  it("matches whole path segments only", () => {
    expect(getGuideTargetForLocation("/evalsx")).toBeUndefined();
  });

  it("maps the dashboard without swallowing other routes", () => {
    expect(getGuideTargetForLocation("/")).toEqual({
      collectionId: "getting-started",
      articleId: "dashboard",
    });
    expect(getGuideTargetForLocation("/no-such-page")).toBeUndefined();
  });
});
