import { describe, expect, it } from "@jest/globals";
import {
  MAX_REJECTED,
  MAX_STEPS,
  MAX_TRACE_BYTES,
  MAX_UNREVIEWED_HOSTS,
  TRACE_VERSION,
  createTraceRecorder,
} from "../trace";

/** A clock that moves by hand. */
function clock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createTraceRecorder", () => {
  it("numbers the steps in the order they were recorded", () => {
    const trace = createTraceRecorder();
    trace.step({
      tool: "search",
      outcome: "ok",
      category: "security_incidents",
      query: "acme breach",
    });
    trace.step({
      tool: "read",
      outcome: "failed",
      reason: "unreachable",
      url: "https://acme.test/",
    });

    const { steps } = trace.snapshot();

    expect(steps.map((step) => step.n)).toEqual([1, 2]);
    expect(steps[1]).toMatchObject({ tool: "read", outcome: "failed", reason: "unreachable" });
  });

  it("keeps the model turn that a step belongs to when it is given, so that the actions of one turn can be grouped", () => {
    const trace = createTraceRecorder();
    trace.step({ tool: "preflight", outcome: "ok" });
    trace.step({ tool: "search", outcome: "ok", turn: 3 });
    trace.step({ tool: "read", outcome: "ok", turn: 3 });
    trace.step({ tool: "finish", outcome: "ok", turn: 4.4 });

    const { steps } = trace.snapshot();

    expect(steps.map((step) => step.turn)).toEqual([undefined, 3, 3, 4]);
    expect("turn" in steps[0]).toBe(false);
  });

  it("keeps the part of a long page that a read asked for, as a whole number, and nothing when none was asked for", () => {
    const trace = createTraceRecorder();
    trace.step({ tool: "read", outcome: "ok", url: "https://acme.test/policy" });
    trace.step({ tool: "read", outcome: "ok", url: "https://acme.test/policy", part: 3 });
    trace.step({ tool: "read", outcome: "ok", part: 2.6 });
    trace.step({ tool: "read", outcome: "ok", part: -1 });
    trace.step({ tool: "read", outcome: "ok", part: Number.NaN });

    const { steps } = trace.snapshot();

    expect("part" in steps[0]).toBe(false);
    expect(steps[1].part).toBe(3);
    expect(steps[2].part).toBe(3);
    expect("part" in steps[3]).toBe(false);
    expect("part" in steps[4]).toBe(false);
  });

  it("keeps who made a step when it was the code or the check of the findings, and nothing when it was the model", () => {
    const trace = createTraceRecorder();
    trace.step({ tool: "search", outcome: "ok", by: "code" });
    trace.step({ tool: "read", outcome: "ok", by: "verification" });
    trace.step({ tool: "search", outcome: "ok" });
    trace.step({ tool: "search", outcome: "ok", by: "somebody" as never });

    const { steps } = trace.snapshot();

    expect(steps[0].by).toBe("code");
    expect(steps[1].by).toBe("verification");
    expect("by" in steps[2]).toBe(false);
    // Only the two known ones are kept.
    expect("by" in steps[3]).toBe(false);
  });

  it("keeps the loop a step belongs to when the research ran as one loop for each category, cleaned and cut like the other labels", () => {
    const trace = createTraceRecorder();
    trace.step({ tool: "search", outcome: "ok", turn: 1, loop: "security_incidents" });
    trace.step({ tool: "read", outcome: "ok", turn: 1, loop: `x\u0000${"l".repeat(100)}` });
    trace.step({ tool: "search", outcome: "ok", turn: 1 });

    const { steps } = trace.snapshot();

    expect(steps[0].loop).toBe("security_incidents");
    expect(steps[1].loop).toHaveLength(60);
    expect(steps[1].loop).not.toContain("\u0000");
    // A step of a single loop, or of the code, has no property, so the stored JSON stays small.
    expect(steps[2]).not.toHaveProperty("loop");
  });

  it("cuts the text fields to their limits and cleans what Postgres refuses", () => {
    const trace = createTraceRecorder();
    trace.step({
      tool: "search",
      outcome: "ok",
      query: `a\u0000${"q".repeat(400)}`,
      url: `https://acme.test/${"u".repeat(900)}`,
      thought: `${"t".repeat(500)}\ud800`,
    });

    const [step] = trace.snapshot().steps;

    expect(step.query).toHaveLength(200);
    expect(step.query).not.toContain("\u0000");
    expect(step.url).toHaveLength(300);
    expect(step.thought).toHaveLength(200);
    // The whole snapshot can be stored: JSON.stringify writes a lone surrogate as an escape.
    expect(JSON.stringify(trace.snapshot())).not.toMatch(/\\ud800/i);
  });

  it("keeps at most MAX_STEPS steps and says it dropped the rest", () => {
    const trace = createTraceRecorder();
    for (let i = 0; i < MAX_STEPS + 5; i += 1) trace.step({ tool: "search", outcome: "ok" });

    const snapshot = trace.snapshot();

    expect(snapshot.steps).toHaveLength(MAX_STEPS);
    expect(snapshot.steps[MAX_STEPS - 1].n).toBe(MAX_STEPS);
    expect(snapshot.truncated).toBe(true);
  });

  it("records the rejected candidates and counts what was left out by reason", () => {
    const trace = createTraceRecorder();
    trace.rejected({
      stage: "validation",
      reason: "no_valid_citation",
      category: "legal_regulatory",
    });
    trace.dropped("source.not_about_vendor", 3);
    trace.dropped("source.not_about_vendor");
    trace.dropped("duplicate.same_run", 2);

    const snapshot = trace.snapshot();

    expect(snapshot.rejected).toEqual([
      { stage: "validation", reason: "no_valid_citation", category: "legal_regulatory" },
    ]);
    expect(snapshot.dropped).toEqual({
      "source.not_about_vendor": 4,
      "duplicate.same_run": 2,
    });
    expect(snapshot.truncated).toBe(false);
  });

  it("keeps at most MAX_REJECTED rejections", () => {
    const trace = createTraceRecorder();
    for (let i = 0; i < MAX_REJECTED + 1; i += 1) {
      trace.rejected({ stage: "validation", reason: "text_unusable" });
    }

    const snapshot = trace.snapshot();

    expect(snapshot.rejected).toHaveLength(MAX_REJECTED);
    expect(snapshot.truncated).toBe(true);
  });

  it("adds up the tokens of the model calls", () => {
    const trace = createTraceRecorder();
    trace.modelCall({
      purpose: "loop",
      ms: 800,
      inputTokens: 1000,
      outputTokens: 50,
      totalTokens: 1050,
    });
    trace.modelCall({
      purpose: "analysis",
      ms: 9000,
      inputTokens: 20000,
      outputTokens: 900,
      totalTokens: 20900,
    });

    const { totals, modelCalls } = trace.snapshot();

    expect(modelCalls.map((call) => call.purpose)).toEqual(["loop", "analysis"]);
    expect(totals).toEqual({
      modelCalls: 2,
      inputTokens: 21000,
      outputTokens: 950,
      totalTokens: 21950,
    });
  });

  it("keeps the model that made a call, cleaned and cut like the other labels", () => {
    const trace = createTraceRecorder();
    trace.modelCall({ purpose: "loop", ms: 800, model: "claude-haiku-5-5" });
    trace.modelCall({ purpose: "analysis", ms: 9000, model: `gpt-${"x".repeat(200)}\u0000` });
    trace.modelCall({ purpose: "hints", ms: 100 });

    const { modelCalls } = trace.snapshot();

    expect(modelCalls[0].model).toBe("claude-haiku-5-5");
    expect(modelCalls[1].model).toHaveLength(60);
    expect(modelCalls[1].model).not.toContain("\u0000");
    // A call that does not say its model has no property, so the stored JSON stays small.
    expect(modelCalls[2]).not.toHaveProperty("model");
  });

  it("keeps the loop that made a model call, so that the calls of loops that ran at once can be told apart", () => {
    const trace = createTraceRecorder();
    trace.modelCall({ purpose: "loop", ms: 800, loop: "certifications" });
    trace.modelCall({ purpose: "loop", ms: 900, loop: `x\u0000${"l".repeat(100)}` });
    trace.modelCall({ purpose: "analysis", ms: 9000 });

    const { modelCalls } = trace.snapshot();

    expect(modelCalls[0].loop).toBe("certifications");
    expect(modelCalls[1].loop).toHaveLength(60);
    expect(modelCalls[1].loop).not.toContain("\u0000");
    expect(modelCalls[2]).not.toHaveProperty("loop");
  });

  it("times the phases and closes the open one when the next starts", () => {
    const time = clock();
    const trace = createTraceRecorder({ now: time.now });

    trace.startPhase("research");
    time.advance(40_000);
    trace.startPhase("analysis");
    time.advance(12_500);
    trace.endPhase();

    expect(trace.snapshot().phases).toEqual([
      { name: "research", ms: 40_000 },
      { name: "analysis", ms: 12_500 },
    ]);
  });

  it("includes the phase that is still open, measured to now", () => {
    const time = clock();
    const trace = createTraceRecorder({ now: time.now });
    trace.startPhase("research");
    time.advance(1_500);

    expect(trace.snapshot().phases).toEqual([{ name: "research", ms: 1_500 }]);
  });

  it("carries the reason the research stopped", () => {
    const trace = createTraceRecorder();
    trace.stopped("budget");

    expect(trace.snapshot()).toMatchObject({ version: TRACE_VERSION, stoppedBecause: "budget" });
  });

  it("keeps the counts of the cited sources by category and the unreviewed hosts, each once, cleaned and cut", () => {
    const trace = createTraceRecorder();
    const NUL = String.fromCharCode(0);
    trace.cited({ official: 1, trusted_press: 2, vendor: 0, unverified: 3 }, [
      "blog.example.net",
      `odd${NUL}.example`,
      "blog.example.net",
      "h".repeat(400),
    ]);

    const { cited } = trace.snapshot();
    expect(cited?.categories).toEqual({ official: 1, trusted_press: 2, vendor: 0, unverified: 3 });
    expect(cited?.unreviewedHosts.slice(0, 2)).toEqual(["blog.example.net", "odd.example"]);
    expect(cited?.unreviewedHosts).toHaveLength(3);
    expect(cited?.unreviewedHosts[2].length).toBeLessThanOrEqual(253);
  });

  it("keeps at most MAX_UNREVIEWED_HOSTS unreviewed hosts and says it dropped the rest", () => {
    const trace = createTraceRecorder();
    const hosts = Array.from({ length: MAX_UNREVIEWED_HOSTS + 5 }, (_, i) => `h${i}.example`);
    trace.cited({ official: 0, trusted_press: 0, vendor: 0, unverified: hosts.length }, hosts);

    const snapshot = trace.snapshot();
    expect(snapshot.cited?.unreviewedHosts).toEqual(hosts.slice(0, MAX_UNREVIEWED_HOSTS));
    expect(snapshot.truncated).toBe(true);
  });

  it("has no counts of cited sources until a run records them", () => {
    expect(createTraceRecorder().snapshot()).not.toHaveProperty("cited");
  });

  it("returns a copy: later records do not change an earlier snapshot", () => {
    const trace = createTraceRecorder();
    trace.step({ tool: "search", outcome: "ok" });
    const first = trace.snapshot();
    trace.step({ tool: "read", outcome: "ok" });

    expect(first.steps).toHaveLength(1);
    expect(trace.snapshot().steps).toHaveLength(2);
  });

  it("stays under MAX_TRACE_BYTES even when every field is as long as it may be", () => {
    const trace = createTraceRecorder();
    for (let i = 0; i < MAX_STEPS * 2; i += 1) {
      trace.step({
        tool: "read",
        outcome: "failed",
        reason: "r".repeat(100),
        category: "c".repeat(100),
        query: "q".repeat(1000),
        url: "https://acme.test/" + "u".repeat(1000),
        thought: "t".repeat(1000),
        omitted: { old: 1, irrelevant: 2, duplicate: 3 },
      });
    }
    for (let i = 0; i < MAX_REJECTED * 2; i += 1) {
      trace.rejected({ stage: "s".repeat(100), reason: "r".repeat(100), text: "x".repeat(1000) });
    }

    expect(Buffer.byteLength(JSON.stringify(trace.snapshot()))).toBeLessThanOrEqual(
      MAX_TRACE_BYTES,
    );
  });
});
