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
import { STATUS_PAGE_INCIDENT_HISTORY } from "../cases/19-status-page-incident-history";
import { SAME_NAME_ON_TWO_LISTS } from "../cases/31-same-name-on-two-lists";
import type { RecordsLookup } from "../../records/types";
import { type LookupStore, createVrdbLookup } from "../../vrdb/lookup";

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

  describe("the databases of a live run", () => {
    /** A run of a case whose web and model answer from the case, and whose databases are given. */
    const recorderOf = (
      evalCase: typeof STATUS_PAGE_INCIDENT_HISTORY,
      more: { records?: RecordsLookup; vrdbStore?: LookupStore },
    ) =>
      createRecorder({
        engine: createReplayEngine(evalCase.recording.searches),
        readPage: createReplayPageReader(evalCase.recording.pages),
        generate: createScriptedGenerate(evalCase.recording),
        ...more,
      });
    /** The case without what its databases answered: a live run has only what it is given. */
    const withoutDatabases = (evalCase: typeof STATUS_PAGE_INCIDENT_HISTORY) => {
      const { records: _records, vrdb: _vrdb, ...recording } = evalCase.recording;
      return { ...evalCase, recording };
    };

    it("records what the public databases answered, and the recording gives the same run again", async () => {
      const evalCase = STATUS_PAGE_INCIDENT_HISTORY;
      const answered = evalCase.recording.records ?? [];
      const asked: unknown[] = [];
      const records: RecordsLookup = async (input) => {
        asked.push(input.target.name);
        return answered;
      };
      const recorder = recorderOf(evalCase, { records });

      const first = await runEvalCase(withoutDatabases(evalCase), {
        engine: recorder.engine,
        readPage: recorder.readPage,
        generate: recorder.generate,
        ...(recorder.records === undefined ? {} : { records: recorder.records }),
      });
      const recorded = recorder.recording();
      const second = await runEvalCase({ ...evalCase, recording: recorded });

      expect(asked).toHaveLength(1);
      expect(recorded.records).toEqual(answered);
      expect(first.pack.length).toBeGreaterThan(0);
      expect(second.pack).toEqual(first.pack);
      expect(second.kept).toEqual(first.kept);
    });

    it("records what the copies of the vendor risk database held, and the recording gives the same run again", async () => {
      const evalCase = SAME_NAME_ON_TWO_LISTS;
      const copies = evalCase.recording.vrdb as NonNullable<Recording["vrdb"]>;
      const kept: unknown[] = [];
      const store: LookupStore = {
        sourceStates: async (ids) => copies.states.filter((state) => ids.includes(state.id)),
        findRecords: async (_keys, sources) =>
          copies.rows.filter((row) => sources.includes(row.sourceId)),
        recordMatches: async (...args) => {
          kept.push(args);
        },
      };
      const recorder = recorderOf(evalCase, { vrdbStore: store });
      const vrdb = createVrdbLookup({
        store: recorder.vrdbStore as LookupStore,
        organizationId: 1,
        vendorId: 0,
        enabled: true,
      });

      const first = await runEvalCase(withoutDatabases(evalCase), {
        engine: recorder.engine,
        readPage: recorder.readPage,
        generate: recorder.generate,
        vrdb,
      });
      const recorded = recorder.recording();
      const second = await runEvalCase({ ...evalCase, recording: recorded });

      expect(recorded.vrdb?.rows.map((row) => row.id).sort()).toEqual(
        copies.rows.map((row) => row.id).sort(),
      );
      // The entry of OFAC's list is offered, as in the replay of the case.
      expect(
        first.pack.some((source) => source.url.startsWith("https://sanctionssearch.ofac")),
      ).toBe(true);
      expect(second.pack).toEqual(first.pack);
      expect(second.kept).toEqual(first.kept);
      // The store decides what is kept of a match; the recorder passes the call on.
      expect(kept).toHaveLength(1);
    });

    it("keeps empty copies when a read of the store fails: a half read would offer what the run did not", async () => {
      const recorder = createRecorder({
        engine: createReplayEngine([]),
        readPage: createReplayPageReader([]),
        generate: createScriptedGenerate(BREACH_TWO_PUBLISHERS.recording),
        vrdbStore: {
          sourceStates: async () => [],
          findRecords: async () => {
            throw new Error("the database is down");
          },
          recordMatches: async () => undefined,
        },
      });
      const store = recorder.vrdbStore as LookupStore;

      await store.sourceStates(["ofac"]);
      await expect(store.findRecords(["name:example"], ["ofac"])).rejects.toThrow(
        "the database is down",
      );
      await store.sourceStates(["ofac"]);

      expect(recorder.recording().vrdb).toEqual({ rows: [], states: [] });
    });

    it("replays a run whose read of the store failed with the coverage the run had", async () => {
      const evalCase = SAME_NAME_ON_TWO_LISTS;
      const store: LookupStore = {
        sourceStates: async () => [],
        findRecords: async () => {
          throw new Error("the database is down");
        },
        recordMatches: async () => undefined,
      };
      const recorder = recorderOf(evalCase, { vrdbStore: store });
      const vrdb = createVrdbLookup({
        store: recorder.vrdbStore as LookupStore,
        organizationId: 1,
        vendorId: 0,
        enabled: true,
      });

      const first = await runEvalCase(withoutDatabases(evalCase), {
        engine: recorder.engine,
        readPage: recorder.readPage,
        generate: recorder.generate,
        vrdb,
      });
      const recorded = recorder.recording();
      const second = await runEvalCase({ ...evalCase, recording: recorded });

      const outcomes = first.found.coverage?.sources.map((source) => source.outcome) ?? [];
      // The live run gave the lists it researches as failed, and offered none of their records.
      expect(outcomes).toContain("failed");
      expect(outcomes).not.toContain("found");
      expect(second.found.coverage).toEqual(first.found.coverage);
      expect(second.pack).toEqual(first.pack);
    });

    it("replays a run whose records were off with every list off, as the live run gave them", async () => {
      const evalCase = SAME_NAME_ON_TWO_LISTS;
      let reads = 0;
      const store: LookupStore = {
        sourceStates: async () => {
          reads += 1;
          return [];
        },
        findRecords: async () => {
          reads += 1;
          return [];
        },
        recordMatches: async () => undefined,
      };
      const recorder = createRecorder({
        engine: createReplayEngine(evalCase.recording.searches),
        readPage: createReplayPageReader(evalCase.recording.pages),
        generate: createScriptedGenerate(evalCase.recording),
        vrdbStore: store,
        vrdbEnabled: false,
      });
      const vrdb = createVrdbLookup({
        store: recorder.vrdbStore as LookupStore,
        organizationId: 1,
        vendorId: 0,
        enabled: false,
      });

      const first = await runEvalCase(withoutDatabases(evalCase), {
        engine: recorder.engine,
        readPage: recorder.readPage,
        generate: recorder.generate,
        vrdb,
      });
      const recorded = recorder.recording();
      const second = await runEvalCase({ ...evalCase, recording: recorded });

      expect(reads).toBe(0);
      expect(recorded.vrdb).toEqual({ rows: [], states: [], enabled: false });
      const outcomes = first.found.coverage?.sources.map((source) => source.outcome) ?? [];
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.every((outcome) => outcome === "off")).toBe(true);
      expect(second.found.coverage).toEqual(first.found.coverage);
      expect(second.pack).toEqual(first.pack);
    });

    it("records no databases for a run that is given none", () => {
      const recorder = recorderOf(BREACH_TWO_PUBLISHERS, {});

      expect(recorder.records).toBeUndefined();
      expect(recorder.vrdbStore).toBeUndefined();
      expect(recorder.recording()).not.toHaveProperty("records");
      expect(recorder.recording()).not.toHaveProperty("vrdb");
    });
  });
});
