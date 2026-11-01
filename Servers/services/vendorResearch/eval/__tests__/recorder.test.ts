import {
  RESEARCH_CATEGORIES,
  type ResearchCategory,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { PageReadError } from "../../../webResearch/readPage";
import { type LoopStep, createLoopStepSchema } from "../../../webResearch/researchLoop";
import { hintsSchema } from "../../hints";
import { verifierSchema } from "../../verifier";
import { buildLoopTaskPrompt } from "../../prompts";
import { credibilityOutputSchema } from "../../schema";
import { createRecorder } from "../recorder";
import type { Recording } from "../types";
import { createReplayEngine, createReplayPageReader, createScriptedGenerate } from "../replay";
import { runEvalCase } from "../runCase";
import { BREACH_TWO_PUBLISHERS } from "../cases/01-breach-two-publishers";
import { UNKNOWN_VENDOR_NOISE } from "../cases/02-unknown-vendor-noise";

/**
 * The answer of an analysis without the confidence of its findings: the schema of the analysis has
 * none, so what the recorder keeps of a case that holds one is the answer without it.
 */
const withoutConfidence = (analysis: Recording["analysis"]) => ({
  ...analysis,
  findings: analysis.findings.map((finding) => {
    const { confidence: _confidence, ...rest } = finding as typeof finding & {
      confidence?: unknown;
    };
    return rest;
  }),
});

/** What every engine declares (see SearchEngine). This one answers both kinds, with no limit on its news. */
const ENGINE = { id: "replay", kinds: ["web", "news"], newsWindowMonths: null } as const;

describe("createRecorder", () => {
  it("records, from a run of a case, a recording that gives the same run again", async () => {
    for (const evalCase of [BREACH_TWO_PUBLISHERS, UNKNOWN_VENDOR_NOISE]) {
      const { recording } = evalCase;
      const recorder = createRecorder({
        engine: createReplayEngine(recording.searches),
        readPage: createReplayPageReader(recording.pages),
        generate: createScriptedGenerate(recording),
      });

      const first = await runEvalCase(evalCase, {
        engine: recorder.engine,
        readPage: recorder.readPage,
        generate: recorder.generate,
      });
      const recorded = recorder.recording();
      const second = await runEvalCase({ ...evalCase, recording: recorded });

      expect(second.pack).toEqual(first.pack);
      expect(second.kept).toEqual(first.kept);
      expect(second.trace.steps.map((step) => step.tool)).toEqual(
        first.trace.steps.map((step) => step.tool),
      );
      expect(recorded.analysis).toEqual(withoutConfidence(recording.analysis));
    }
  });

  it("keeps the steps in the order the model took them, as the loop's schema parsed them", async () => {
    const recording = BREACH_TWO_PUBLISHERS.recording;
    const recorder = createRecorder({
      engine: createReplayEngine(recording.searches),
      readPage: createReplayPageReader(recording.pages),
      generate: createScriptedGenerate(recording),
    });
    await runEvalCase(BREACH_TWO_PUBLISHERS, {
      engine: recorder.engine,
      readPage: recorder.readPage,
      generate: recorder.generate,
    });

    expect(recorder.recording().steps).toEqual(recording.steps);
  });

  it("records a page that could not be read with the reason", async () => {
    const recorder = createRecorder({
      engine: { ...ENGINE, search: async () => [] },
      readPage: async () => {
        throw new PageReadError("blocked_by_robots");
      },
      generate: createScriptedGenerate({
        steps: [],
        analysis: { findings: [], category_notes: [] },
      }),
    });

    await expect(recorder.readPage("https://acme.com/trust")).rejects.toMatchObject({
      reason: "blocked_by_robots",
    });
    expect(recorder.recording().pages).toEqual([
      { url: "https://acme.com/trust", failure: "blocked_by_robots" },
    ]);
  });

  it("passes on a failure of the search and records nothing for it", async () => {
    const recorder = createRecorder({
      engine: {
        ...ENGINE,
        search: async () => {
          throw new Error("the search is not available");
        },
      },
      readPage: async () => {
        throw new Error("unused");
      },
      generate: createScriptedGenerate({
        steps: [],
        analysis: { findings: [], category_notes: [] },
      }),
    });

    await expect(recorder.engine.search("Acme", "news")).rejects.toThrow("not available");
    expect(recorder.recording().searches).toEqual([]);
  });

  it("tells the analysis from a step of the loop by its schema", async () => {
    const recording = {
      steps: [{ thought: "Done", actions: [{ action: "finish" as const }] }],
      analysis: {
        findings: [],
        category_notes: [{ category: "ai_specific" as const, note: "None." }],
      },
    };
    const recorder = createRecorder({
      engine: { ...ENGINE, search: async () => [] },
      readPage: async () => {
        throw new Error("unused");
      },
      generate: createScriptedGenerate(recording),
    });

    await recorder.generate({
      model: {},
      schema: credibilityOutputSchema,
      system: "s",
      prompt: "p",
    } as never);

    expect(recorder.recording().analysis).toEqual(recording.analysis);
    expect(recorder.recording().steps).toEqual([]);
  });

  it("keeps the answer of the call for hints apart from the steps of the loop", async () => {
    const hints = { queries: [{ category: "legal_regulatory" as const, query: "Acme lawsuit" }] };
    const recorder = createRecorder({
      engine: { ...ENGINE, search: async () => [] },
      readPage: async () => {
        throw new Error("unused");
      },
      generate: createScriptedGenerate({
        steps: [],
        analysis: { findings: [], category_notes: [] },
        hints,
      }),
    });

    await recorder.generate({ model: {}, schema: hintsSchema, system: "s", prompt: "p" } as never);

    expect(recorder.recording().hints).toEqual(hints);
    expect(recorder.recording().steps).toEqual([]);
  });

  it("keeps the answer of the verifier apart from the steps of the loop", async () => {
    const verifier = {
      verdicts: [
        { finding: 1, same_company: true, quote_supports_claim: false, source_in_window: true },
      ],
    };
    const recorder = createRecorder({
      engine: { ...ENGINE, search: async () => [] },
      readPage: async () => {
        throw new Error("unused");
      },
      generate: createScriptedGenerate({
        steps: [],
        analysis: { findings: [], category_notes: [] },
        verifier,
      }),
    });

    await recorder.generate({
      model: {},
      schema: verifierSchema,
      system: "s",
      prompt: "p",
    } as never);

    expect(recorder.recording().verifier).toEqual(verifier);
    expect(recorder.recording().steps).toEqual([]);
  });

  describe("the steps of loops that run one for each category", () => {
    const NOW = new Date("2031-04-20T12:00:00Z");
    const target = { name: "Acme", domain: "acme.com", provides: "Cloud hosting" };
    const promptOf = (category: ResearchCategory) =>
      buildLoopTaskPrompt({ target, now: NOW, researchable: [category], scope: category });
    const finish: LoopStep<ResearchCategory> = { thought: "Done", actions: [{ action: "finish" }] };
    const search: LoopStep<ResearchCategory> = {
      thought: "Search",
      actions: [
        { action: "search", category: "security_incidents", query: "Acme breach", kind: "news" },
      ],
    };
    const recorderOf = (loops: Recording["loops"]) =>
      createRecorder({
        engine: { ...ENGINE, search: async () => [] },
        readPage: async () => {
          throw new Error("unused");
        },
        generate: createScriptedGenerate({
          steps: [finish],
          loops,
          analysis: { findings: [], category_notes: [] },
        }),
      });
    const schema = createLoopStepSchema(RESEARCH_CATEGORIES);
    const ask = (recorder: ReturnType<typeof recorderOf>, prompt: string) =>
      recorder.generate({ model: {}, schema, system: "s", prompt } as never);

    it("records them under the category of their loop, in order, and the others as the steps of one loop", async () => {
      const recorder = recorderOf({ security_incidents: [search, finish] });

      await ask(recorder, promptOf("security_incidents"));
      await ask(recorder, promptOf("certifications"));
      await ask(recorder, promptOf("security_incidents"));
      await ask(recorder, "a loop of all the categories");

      expect(recorder.recording().loops).toEqual({
        security_incidents: [search, finish],
        // Nothing was scripted for it, so the replay finished the loop at once.
        certifications: [expect.objectContaining({ actions: [{ action: "finish" }] })],
      });
      expect(recorder.recording().steps).toEqual([finish]);
    });

    it("leaves `loops` out of a recording of a run that had one loop", async () => {
      const recorder = recorderOf(undefined);

      await ask(recorder, "a loop of all the categories");

      expect(recorder.recording()).not.toHaveProperty("loops");
    });
  });

  it("leaves the hints out of a recording whose run asked for none", () => {
    const recorder = createRecorder({
      engine: { ...ENGINE, search: async () => [] },
      readPage: async () => {
        throw new Error("unused");
      },
      generate: createScriptedGenerate({
        steps: [],
        analysis: { findings: [], category_notes: [] },
      }),
    });

    expect(recorder.recording()).not.toHaveProperty("hints");
  });
});
