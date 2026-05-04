import { ENTITY_TIPS, Tip, EntityTips } from "../entityTips";

describe("ENTITY_TIPS", () => {
  it("should be defined and be an object", () => {
    expect(ENTITY_TIPS).toBeDefined();
    expect(typeof ENTITY_TIPS).toBe("object");
    expect(ENTITY_TIPS).not.toBeNull();
  });

  const expectedKeys = [
    "dashboard",
    "tasks",
    "overview",
    "framework",
    "vendors",
    "model-inventory",
    "risk-management",
    "training",
    "file-manager",
    "reporting",
    "ai-trust-center",
    "policies",
    "ai-incident-managements",
    "event-tracker",
    "settings",
    "shadow-ai-insights",
    "shadow-ai-user-activity",
    "shadow-ai-tools",
    "shadow-ai-rules",
    "shadow-ai-settings",
    "evals-overview",
    "evals-experiments",
    "evals-datasets",
    "evals-scorers",
    "ai-gateway-endpoints",
    "ai-gateway-dashboard",
    "ai-gateway-playground",
    "ai-gateway-settings",
    "ai-gateway-virtual-keys",
    "ai-gateway-prompts",
    "ai-gateway-logs",
    "ai-gateway-guardrails",
  ];

  it.each(expectedKeys)("should contain the '%s' entity key", (key) => {
    expect(ENTITY_TIPS).toHaveProperty(key);
  });

  it("should have at least 20 entity types", () => {
    const entityCount = Object.keys(ENTITY_TIPS).length;
    expect(entityCount).toBeGreaterThanOrEqual(20);
  });

  it("should have an array of tips for each entity", () => {
    for (const key of Object.keys(ENTITY_TIPS)) {
      expect(Array.isArray(ENTITY_TIPS[key])).toBe(true);
      expect(ENTITY_TIPS[key].length).toBeGreaterThan(0);
    }
  });

  it("should have header and content strings for every tip", () => {
    for (const [, tips] of Object.entries(ENTITY_TIPS)) {
      tips.forEach((tip: Tip) => {
        expect(typeof tip.header).toBe("string");
        expect(tip.header.length).toBeGreaterThan(0);
        expect(typeof tip.content).toBe("string");
        expect(tip.content.length).toBeGreaterThan(0);
      });
    }
  });

  it("should conform to the EntityTips interface shape", () => {
    const typed: EntityTips = ENTITY_TIPS;
    expect(typed).toBe(ENTITY_TIPS);
  });
});
