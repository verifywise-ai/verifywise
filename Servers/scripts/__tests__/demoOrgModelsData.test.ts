import { describe, it, expect } from "@jest/globals";
import { EXTRA_MODELS } from "../seeds/demoOrgModelsData";

describe("demo-org seeded models (M-L7)", () => {
  it("are all marked as demo data, so Delete demo data removes them", () => {
    expect(EXTRA_MODELS.length).toBeGreaterThan(0);
    for (const model of EXTRA_MODELS) {
      expect(model).toMatchObject({ is_demo: true });
    }
  });

  it("are distinct by provider_model, the key the seeder's pre-delete uses", () => {
    const names = EXTRA_MODELS.map((m) => m.provider_model);
    expect(new Set(names).size).toBe(names.length);
  });
});
