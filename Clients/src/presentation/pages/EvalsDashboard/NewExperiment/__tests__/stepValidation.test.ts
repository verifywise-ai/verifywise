import {
  canProceedToNextStep,
  getMissingKeyProviders,
  type JudgeLlmConfigForValidation,
  type ModelConfigForValidation,
} from "../stepValidation";

const baseModel: ModelConfigForValidation = {
  name: "",
  accessMethod: "",
  endpointUrl: "",
  apiKey: "",
};

const baseJudge: JudgeLlmConfigForValidation = {
  provider: "",
  model: "",
  endpointUrl: "",
};

const hasApiKey = (configured: string[]) => (providerId: string) => configured.includes(providerId);

describe("stepValidation", () => {
  describe("getMissingKeyProviders", () => {
    const scorers = [
      {
        id: "s1",
        config: { judgeModel: { provider: "OpenAI" } },
      },
      {
        id: "s2",
        config: { judgeModel: { provider: "anthropic" } },
      },
      {
        id: "s3",
        config: { judgeModel: { provider: "ollama" } },
      },
      {
        id: "s4",
        config: { judgeModel: { provider: "self-hosted" } },
      },
      {
        id: "s5",
        config: { judgeModel: "gpt-4" },
      },
      {
        id: "s6",
        config: null,
      },
    ];

    it("returns [] for standard mode", () => {
      expect(
        getMissingKeyProviders({
          judgeMode: "standard",
          selectedScorerIds: [],
          userScorers: scorers,
          configuredApiKeys: [],
        }),
      ).toEqual([]);
    });

    it("collects providers missing a saved org key", () => {
      expect(
        getMissingKeyProviders({
          judgeMode: "scorer",
          selectedScorerIds: [],
          userScorers: scorers,
          configuredApiKeys: [],
        }),
      ).toEqual(["openai", "anthropic"]);
    });

    it("deduplicates providers and skips already-configured keys", () => {
      expect(
        getMissingKeyProviders({
          judgeMode: "both",
          selectedScorerIds: [],
          userScorers: scorers,
          configuredApiKeys: [{ provider: "anthropic" }],
        }),
      ).toEqual(["openai"]);
    });

    it("respects selectedScorerIds when provided", () => {
      expect(
        getMissingKeyProviders({
          judgeMode: "scorer",
          selectedScorerIds: ["s2"],
          userScorers: scorers,
          configuredApiKeys: [],
        }),
      ).toEqual(["anthropic"]);
    });

    it("excludes local/self-hosted scorers", () => {
      expect(
        getMissingKeyProviders({
          judgeMode: "scorer",
          selectedScorerIds: ["s3", "s4"],
          userScorers: scorers,
          configuredApiKeys: [],
        }),
      ).toEqual([]);
    });
  });

  describe("canProceedToNextStep", () => {
    const baseParams = {
      selectedSavedModelId: null,
      selectedModelProvider: undefined,
      hasApiKey: hasApiKey([]),
      datasetPromptCount: 0,
      judgeMode: "standard" as const,
      userScorersCount: 0,
      missingKeyProviders: [],
      judgeLlm: baseJudge,
    };

    describe("step 0 (model)", () => {
      it("returns false without a name", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: baseModel,
          }),
        ).toBe(false);
      });

      it("returns false without an access method", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: { ...baseModel, name: "gpt-4o" },
          }),
        ).toBe(false);
      });

      it("requires an endpoint URL for URL-based providers", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: { ...baseModel, name: "local-model", accessMethod: "local" },
            selectedModelProvider: { needsUrl: true },
          }),
        ).toBe(false);
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: {
              ...baseModel,
              name: "local-model",
              accessMethod: "local",
              endpointUrl: "http://x",
            },
            selectedModelProvider: { needsUrl: true },
          }),
        ).toBe(true);
      });

      it("requires a key for cloud providers", () => {
        const cloudModel = { ...baseModel, name: "gpt-4o", accessMethod: "openai" };
        expect(canProceedToNextStep({ ...baseParams, activeStep: 0, model: cloudModel })).toBe(
          false,
        );
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: { ...cloudModel, apiKey: "sk-test" },
          }),
        ).toBe(true);
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: cloudModel,
            hasApiKey: hasApiKey(["openai"]),
          }),
        ).toBe(true);
      });

      it("maps custom_api to the saved 'custom' key", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: { ...baseModel, name: "m", accessMethod: "custom_api", apiKey: "sk" },
            hasApiKey: hasApiKey(["custom"]),
          }),
        ).toBe(true);
      });

      it("skips the key check for local providers", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: { ...baseModel, name: "llama2", accessMethod: "ollama" },
          }),
        ).toBe(true);
      });

      it("always allows a saved model selection", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 0,
            model: baseModel,
            selectedSavedModelId: "5",
          }),
        ).toBe(true);
      });
    });

    describe("step 1 (dataset)", () => {
      it("requires loaded prompts", () => {
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 1,
            model: baseModel,
            datasetPromptCount: 0,
          }),
        ).toBe(false);
        expect(
          canProceedToNextStep({
            ...baseParams,
            activeStep: 1,
            model: baseModel,
            datasetPromptCount: 3,
          }),
        ).toBe(true);
      });
    });

    describe("step 2 (scorer / judge)", () => {
      it("scorer mode requires scorers and no missing keys", () => {
        const params = {
          ...baseParams,
          activeStep: 2,
          model: baseModel,
          judgeMode: "scorer" as const,
        };
        expect(canProceedToNextStep({ ...params, userScorersCount: 0 })).toBe(false);
        expect(
          canProceedToNextStep({ ...params, userScorersCount: 1, missingKeyProviders: ["openai"] }),
        ).toBe(false);
        expect(canProceedToNextStep({ ...params, userScorersCount: 1 })).toBe(true);
      });

      it("standard mode requires a judge provider and model", () => {
        const params = {
          ...baseParams,
          activeStep: 2,
          model: baseModel,
          judgeMode: "standard" as const,
        };
        expect(canProceedToNextStep({ ...params, judgeLlm: baseJudge })).toBe(false);
        expect(
          canProceedToNextStep({
            ...params,
            judgeLlm: { ...baseJudge, provider: "openai", model: "gpt-4o" },
          }),
        ).toBe(true);
      });

      it("standard custom_api judge requires an endpoint URL", () => {
        const params = {
          ...baseParams,
          activeStep: 2,
          model: baseModel,
          judgeMode: "standard" as const,
        };
        expect(
          canProceedToNextStep({
            ...params,
            judgeLlm: { ...baseJudge, provider: "custom_api", model: "m" },
          }),
        ).toBe(false);
        expect(
          canProceedToNextStep({
            ...params,
            judgeLlm: { ...baseJudge, provider: "custom_api", model: "m", endpointUrl: "http://x" },
          }),
        ).toBe(true);
      });

      it("both mode requires scorers, keys and a judge", () => {
        const params = {
          ...baseParams,
          activeStep: 2,
          model: baseModel,
          judgeMode: "both" as const,
          userScorersCount: 1,
          judgeLlm: { ...baseJudge, provider: "openai", model: "gpt-4o" },
        };
        expect(canProceedToNextStep(params)).toBe(true);
        expect(canProceedToNextStep({ ...params, userScorersCount: 0 })).toBe(false);
        expect(canProceedToNextStep({ ...params, missingKeyProviders: ["openai"] })).toBe(false);
        expect(canProceedToNextStep({ ...params, judgeLlm: baseJudge })).toBe(false);
      });
    });

    it("returns true for steps outside the known gates", () => {
      expect(
        canProceedToNextStep({
          ...baseParams,
          activeStep: 3,
          model: baseModel,
          datasetPromptCount: 0,
        }),
      ).toBe(true);
    });
  });
});
