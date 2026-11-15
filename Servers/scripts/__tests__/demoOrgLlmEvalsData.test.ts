/**
 * The demo org's LLM Evals history must match the datasets it points to:
 * a real run (or a Rerun) on a seeded golden set has to evaluate the prompts
 * the seeded experiments show. Before this, "Knowledge base assistant golden
 * set" was seeded as a 10-prompt single-turn RAG set while its file held 2
 * multi-turn conversations, and seeded runs stored no dataset prompts, so a
 * Rerun failed with "No prompts or conversations in dataset".
 */
import {
  LLM_EVALS_PROJECTS,
  LLM_EVALS_TEMPLATE_FOLDERS,
  loadGoldenSet,
  seededExperimentConfig,
} from "../seeds/demoOrgLlmEvalsData";

describe("demo org LLM Evals golden sets", () => {
  it.each(LLM_EVALS_PROJECTS.map((p) => [p.name, p] as const))(
    "%s: golden set is single-turn and backs every seeded output",
    (_name, project) => {
      // loadGoldenSet throws on multi-turn items, missing RAG context or a
      // prompt count that differs from the seeded outputs.
      const golden = loadGoldenSet(project);

      expect(golden.items).toHaveLength(project.seededOutputs.length);
      expect(golden.sizeBytes).toBeGreaterThan(0);
      if (project.use_case === "rag") {
        expect(golden.items.every((item) => (item.retrieval_context?.length ?? 0) > 0)).toBe(true);
      }
    },
  );

  it.each(LLM_EVALS_PROJECTS.map((p) => [p.name, p] as const))(
    "%s: golden set stays out of the built-in template folders",
    (_name, project) => {
      const topFolder = project.dataset.path.split("/")[0];
      expect(project.dataset.path).toContain("/");
      expect(LLM_EVALS_TEMPLATE_FOLDERS).not.toContain(topFolder);
    },
  );

  it.each(LLM_EVALS_PROJECTS.map((p) => [p.name, p] as const))(
    "%s: seeded experiment config can be rerun",
    (_name, project) => {
      const golden = loadGoldenSet(project);
      const config = seededExperimentConfig(project, golden, 42);

      // Same dataset shape NewExperimentModal sends; the runner uses the
      // inline prompts first.
      expect(config.dataset).toEqual({
        name: project.dataset.name,
        path: project.dataset.path,
        datasetId: 42,
        prompts: golden.items,
        count: golden.items.length,
      });
      // The runner reads metrics as { key: true }; a string list would fall
      // back to the default metric set on Rerun.
      expect(config.metrics).toEqual(Object.fromEntries(project.metrics.map((m) => [m, true])));
      expect(JSON.stringify(config)).not.toMatch(/apiKey/i);
    },
  );
});
