import {
  datasetNameFromPresetPath,
  generateDefaultExperimentName,
  shortenForExperimentName,
} from "../experimentNameHelpers";

describe("experimentNameHelpers", () => {
  describe("shortenForExperimentName", () => {
    it.each([
      [undefined, ""],
      [null, ""],
      ["", ""],
      ["gpt-4o", "gpt-4o"],
      ["openai/gpt-4o-mini", "gpt-4o-mini"],
      ["mistralai/mistral-medium-3-5", "mistral-medium-3-5"],
      ["claude-3-5-sonnet-20241022", "claude-3-5-sonnet"],
      ["gpt-4-2024-05-13", "gpt-4"],
      ["openai/gpt-4-2024-05-13", "gpt-4"],
    ])("shortenForExperimentName(%p) → %p", (input, expected) => {
      expect(shortenForExperimentName(input)).toBe(expected);
    });
  });

  describe("generateDefaultExperimentName", () => {
    it("builds <model> × <dataset>", () => {
      expect(generateDefaultExperimentName("gpt-4o", "Basic Chatbot", [])).toBe(
        "gpt-4o × Basic Chatbot",
      );
    });

    it("shortens a namespaced model id", () => {
      expect(generateDefaultExperimentName("openai/gpt-4o-mini", "RAG", [])).toBe(
        "gpt-4o-mini × RAG",
      );
    });

    it("appends #2 when the base name is taken", () => {
      expect(
        generateDefaultExperimentName("gpt-4o", "Basic Chatbot", ["gpt-4o × Basic Chatbot"]),
      ).toBe("gpt-4o × Basic Chatbot #2");
    });

    it("increments the suffix until a free name is found", () => {
      expect(
        generateDefaultExperimentName("gpt-4o", "Basic Chatbot", [
          "gpt-4o × Basic Chatbot",
          "gpt-4o × Basic Chatbot #2",
          "gpt-4o × Basic Chatbot #3",
        ]),
      ).toBe("gpt-4o × Basic Chatbot #4");
    });

    it("falls back to model/dataset placeholders", () => {
      expect(generateDefaultExperimentName("", "", [])).toBe("model × dataset");
      expect(generateDefaultExperimentName("gpt-4o", "", [])).toBe("gpt-4o × dataset");
      expect(generateDefaultExperimentName("", "RAG", [])).toBe("model × RAG");
    });
  });

  describe("datasetNameFromPresetPath", () => {
    it.each([
      [undefined, ""],
      [null, ""],
      ["", ""],
      ["chatbot/chatbot_coding_helper.json", "Chatbot Coding Helper"],
      ["rag/rag_wikipedia_small.json", "Rag Wikipedia Small"],
      ["agent/agent_planning_multiturn.json", "Agent Planning Multiturn"],
    ])("datasetNameFromPresetPath(%p) → %p", (path, expected) => {
      expect(datasetNameFromPresetPath(path)).toBe(expected);
    });
  });
});
