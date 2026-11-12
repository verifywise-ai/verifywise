/**
 * The demo org's LLM Evals history must match the datasets it points to:
 * a real run on a seeded golden set has to evaluate the prompts the seeded
 * experiments show, with the same turn type. Before this test the
 * "Knowledge base assistant golden set" was seeded as a 10-prompt single-turn
 * RAG set while its file held 2 multi-turn conversations, so a live run
 * silently switched to conversational metrics.
 */
import { readFileSync } from "fs";
import path from "path";
import { LLM_EVALS_PROJECTS } from "../seeds/demoOrgLlmEvalsData";

const DATASETS_ROOT = path.resolve(__dirname, "../../../EvaluationModule/data/datasets");

type DatasetItem = {
  prompt?: string;
  expected_output?: string;
  retrieval_context?: string[];
  turns?: unknown;
};

function readDataset(relPath: string): DatasetItem[] {
  return JSON.parse(readFileSync(path.join(DATASETS_ROOT, relPath), "utf8"));
}

describe("demo org LLM Evals golden sets", () => {
  it.each(LLM_EVALS_PROJECTS.map((p) => [p.name, p] as const))(
    "%s: dataset file matches the seeded prompts",
    (_name, project) => {
      const items = readDataset(project.dataset.path);

      // Single-turn: the seeder registers every golden set as single-turn.
      expect(items.every((item) => item.turns === undefined)).toBe(true);
      expect(items.map((item) => item.prompt)).toEqual(project.samples.map((s) => s.input));
      expect(items.map((item) => item.expected_output)).toEqual(
        project.samples.map((s) => s.expected),
      );

      if (project.use_case === "rag") {
        // The seeded runs score faithfulness and context metrics, which need
        // retrieved passages on every prompt.
        expect(items.map((item) => item.retrieval_context)).toEqual(
          project.samples.map((s) => s.context),
        );
        expect(project.samples.every((s) => (s.context?.length ?? 0) > 0)).toBe(true);
      }
    },
  );

  it("keeps golden sets out of the built-in template folders", () => {
    // The template list reads chatbot/, rag/, agent/ and safety/ only.
    for (const project of LLM_EVALS_PROJECTS) {
      expect(project.dataset.path.startsWith("demo/")).toBe(true);
    }
  });
});
