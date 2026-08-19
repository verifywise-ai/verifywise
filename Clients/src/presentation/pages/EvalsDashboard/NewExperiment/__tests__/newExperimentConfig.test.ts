import {
  MODEL_PROVIDERS_WITHOUT_API_KEY,
  SCORER_PROVIDERS_WITHOUT_API_KEY,
  WIZARD_STEPS,
} from "../newExperimentConfig";

describe("newExperimentConfig", () => {
  it("exposes the wizard step labels in order", () => {
    expect(WIZARD_STEPS).toEqual(["Model", "Dataset", "Scorer / Judge", "Metrics"]);
  });

  it("lists local model providers that need no API key", () => {
    expect(MODEL_PROVIDERS_WITHOUT_API_KEY).toContain("ollama");
    expect(MODEL_PROVIDERS_WITHOUT_API_KEY).toContain("local");
  });

  it("lists local scorer judge providers that need no saved org key", () => {
    expect(SCORER_PROVIDERS_WITHOUT_API_KEY).toContain("self-hosted");
    expect(SCORER_PROVIDERS_WITHOUT_API_KEY).toContain("ollama");
  });
});
