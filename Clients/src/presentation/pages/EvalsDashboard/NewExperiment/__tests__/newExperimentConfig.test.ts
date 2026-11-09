import {
  MODEL_PROVIDERS_WITHOUT_API_KEY,
  SCORER_PROVIDERS_WITHOUT_API_KEY,
  validationAlertTitle,
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

  it("titles the pre-run warning by what the provider refused", () => {
    expect(validationAlertTitle(false)).toBe("API key may not be configured");
    expect(validationAlertTitle(true, "model_not_found")).toBe("The provider refused this model");
    expect(validationAlertTitle(true, "invalid_api_key")).toBe(
      "The provider refused the saved API key",
    );
    expect(validationAlertTitle(true, "permission_denied")).toBe(
      "The provider refused the saved API key",
    );
    expect(validationAlertTitle(true, "budget_exceeded")).toBe("The provider refused this request");
  });
});
