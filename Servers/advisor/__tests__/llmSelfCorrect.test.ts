/**
 * llmSelfCorrect — wrapper tests.
 *
 * Uses dependency injection (custom `generateImpl`) instead of jest.mock so
 * the suite stays fast and deterministic. We exercise:
 *   - Happy path (succeeds first try) → no self-correction, attempts=1
 *   - Validation failure on first call, success on second → self-corrected
 *   - Validation failure across the full budget → rethrows
 *   - Non-validation errors (auth, network) bypass self-correction entirely
 *   - Corrective prompt builder shape + truncation
 *   - extractValidationIssues walks `cause` chain
 */

import { describe, expect, it, jest } from "@jest/globals";
import { z, ZodError } from "zod";
import {
  generateObjectWithSelfCorrection,
  buildCorrectionDirective,
  extractValidationIssues,
  type GenerateObjectImpl,
} from "../llmSelfCorrect";

const sampleSchema = z.object({
  name: z.string().min(3),
  count: z.number().min(0),
});
type Sample = z.infer<typeof sampleSchema>;

/** Build a fake ZodError with a single issue, like the SDK would surface. */
function makeZodError(path: string, message: string): ZodError {
  return new ZodError([
    {
      code: "custom",
      path: path.split(".").filter(Boolean),
      message,
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* extractValidationIssues                                            */
/* ------------------------------------------------------------------ */

describe("llmSelfCorrect / extractValidationIssues", () => {
  it("detects a top-level ZodError", () => {
    const err = makeZodError("name", "must be at least 3 characters");
    const issues = extractValidationIssues(err);
    expect(issues).not.toBeNull();
    expect(issues!).toHaveLength(1);
    expect(issues![0].path).toBe("name");
  });

  it("walks `.cause` to find a wrapped ZodError", () => {
    const inner = makeZodError("count", "must be a number");
    const outer = Object.assign(new Error("AI SDK wrapper"), { cause: inner });
    const issues = extractValidationIssues(outer);
    expect(issues).not.toBeNull();
    expect(issues![0].path).toBe("count");
  });

  it("walks two levels of nesting via `.cause.cause`", () => {
    const inner = makeZodError("a.b", "bad");
    const mid = Object.assign(new Error("inner"), { cause: inner });
    const outer = Object.assign(new Error("outer"), { cause: mid });
    const issues = extractValidationIssues(outer);
    expect(issues).not.toBeNull();
    expect(issues![0].path).toBe("a.b");
  });

  it("returns null for a plain Error (non-validation)", () => {
    expect(extractValidationIssues(new Error("network down"))).toBeNull();
  });

  it("returns null for unknown shapes", () => {
    expect(extractValidationIssues("just a string")).toBeNull();
    expect(extractValidationIssues(undefined)).toBeNull();
  });

  it("does not infinite-loop on circular causes", () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;
    expect(extractValidationIssues(a)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* buildCorrectionDirective                                           */
/* ------------------------------------------------------------------ */

describe("llmSelfCorrect / buildCorrectionDirective", () => {
  it("returns empty string for empty issue list", () => {
    expect(buildCorrectionDirective([])).toBe("");
  });

  it("formats single issue with backticks around path", () => {
    const out = buildCorrectionDirective([{ path: "summary", message: "must be 40 chars" }]);
    expect(out).toContain("SELF-CORRECTION REQUIRED");
    expect(out).toContain("`summary`");
    expect(out).toContain("must be 40 chars");
  });

  it("renders root path as (root) when path is empty", () => {
    const out = buildCorrectionDirective([{ path: "", message: "bad shape" }]);
    expect(out).toContain("`(root)`");
  });

  it("truncates issue list to 8", () => {
    const issues = Array.from({ length: 15 }, (_, i) => ({
      path: `f${i}`,
      message: `issue ${i}`,
    }));
    const out = buildCorrectionDirective(issues);
    expect(out).toContain("issue 0");
    expect(out).toContain("issue 7");
    expect(out).not.toContain("issue 8");
  });
});

/* ------------------------------------------------------------------ */
/* generateObjectWithSelfCorrection — happy path                      */
/* ------------------------------------------------------------------ */

describe("llmSelfCorrect / generateObjectWithSelfCorrection", () => {
  it("succeeds first try → attempts=1, selfCorrected=false", async () => {
    const valid: Sample = { name: "Alice", count: 3 };
    const mock: GenerateObjectImpl = jest.fn(async () => ({
      object: valid,
    })) as unknown as GenerateObjectImpl;

    const result = await generateObjectWithSelfCorrection<Sample>(
      {
        model: { fake: true },
        schema: sampleSchema,
        system: "you are helpful",
        prompt: "give me a sample",
      },
      mock,
    );
    expect(result.object).toEqual(valid);
    expect(result.attempts).toBe(1);
    expect(result.selfCorrected).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries with corrective prompt after a Zod fail; eventually succeeds", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const valid: Sample = { name: "Bob", count: 2 };
    let invocation = 0;
    const mock: GenerateObjectImpl = (async (params: Record<string, unknown>) => {
      calls.push(params);
      invocation += 1;
      if (invocation === 1) {
        throw makeZodError("name", "too short");
      }
      return { object: valid };
    }) as unknown as GenerateObjectImpl;

    const result = await generateObjectWithSelfCorrection<Sample>(
      {
        model: { fake: true },
        schema: sampleSchema,
        system: "ORIGINAL_SYSTEM",
        prompt: "p",
      },
      mock,
    );

    expect(result.object).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(result.selfCorrected).toBe(true);
    expect(result.lastValidationIssues?.[0].path).toBe("name");

    // First call: original system prompt only
    expect(calls[0].system).toBe("ORIGINAL_SYSTEM");
    // Second call: original + corrective directive
    expect(calls[1].system).toContain("ORIGINAL_SYSTEM");
    expect(calls[1].system).toContain("SELF-CORRECTION REQUIRED");
  });

  it("rethrows after exhausting the self-correction budget", async () => {
    let invocation = 0;
    const mock: GenerateObjectImpl = (async () => {
      invocation += 1;
      throw makeZodError("count", "must be a number");
    }) as unknown as GenerateObjectImpl;

    await expect(
      generateObjectWithSelfCorrection<Sample>(
        {
          model: {},
          schema: sampleSchema,
          system: "s",
          prompt: "p",
          maxSelfCorrectionAttempts: 1, // → 2 total attempts
        },
        mock,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(invocation).toBe(2);
  });

  it("does NOT retry on non-validation errors (e.g., auth, network)", async () => {
    let invocation = 0;
    const networkErr = new Error("ECONNRESET");
    const mock: GenerateObjectImpl = (async () => {
      invocation += 1;
      throw networkErr;
    }) as unknown as GenerateObjectImpl;

    await expect(
      generateObjectWithSelfCorrection<Sample>(
        { model: {}, schema: sampleSchema, system: "s", prompt: "p" },
        mock,
      ),
    ).rejects.toBe(networkErr);
    expect(invocation).toBe(1); // no retry
  });

  it("disables self-correction when maxSelfCorrectionAttempts=0", async () => {
    let invocation = 0;
    const mock: GenerateObjectImpl = (async () => {
      invocation += 1;
      throw makeZodError("name", "too short");
    }) as unknown as GenerateObjectImpl;

    await expect(
      generateObjectWithSelfCorrection<Sample>(
        {
          model: {},
          schema: sampleSchema,
          system: "s",
          prompt: "p",
          maxSelfCorrectionAttempts: 0,
        },
        mock,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(invocation).toBe(1);
  });

  it("forwards extra params (like maxOutputTokens) to the inner call", async () => {
    let captured: Record<string, unknown> | null = null;
    const mock: GenerateObjectImpl = (async (p: Record<string, unknown>) => {
      captured = p;
      return { object: { name: "Carol", count: 0 } };
    }) as unknown as GenerateObjectImpl;

    await generateObjectWithSelfCorrection<Sample>(
      {
        model: {},
        schema: sampleSchema,
        system: "s",
        prompt: "p",
        extra: { maxOutputTokens: 2048, seed: 42 },
      },
      mock,
    );
    expect(captured).not.toBeNull();
    expect(captured!.maxOutputTokens).toBe(2048);
    expect(captured!.seed).toBe(42);
  });

  it("temperature defaults to 0", async () => {
    let captured: Record<string, unknown> | null = null;
    const mock: GenerateObjectImpl = (async (p: Record<string, unknown>) => {
      captured = p;
      return { object: { name: "Dave", count: 1 } };
    }) as unknown as GenerateObjectImpl;

    await generateObjectWithSelfCorrection<Sample>(
      { model: {}, schema: sampleSchema, system: "s", prompt: "p" },
      mock,
    );
    expect(captured!.temperature).toBe(0);
  });
});
