import { describe, expect, it } from "vitest";
import { experimentPromptCount } from "../experimentPromptCount";

describe("experimentPromptCount", () => {
  it("prefers the prompts the run attempted", () => {
    expect(
      experimentPromptCount({
        config: { dataset: { count: 40 } },
        results: { prompts_attempted: 30, total_prompts: 29 },
      }),
    ).toBe(30);
  });

  it("falls back to the dataset size for runs saved before prompts_attempted", () => {
    expect(
      experimentPromptCount({ config: { dataset: { count: 30 } }, results: { total_prompts: 29 } }),
    ).toBe(30);
    expect(
      experimentPromptCount({
        config: { dataset: { prompts: [{}, {}, {}] } },
        results: { total_prompts: 2 },
      }),
    ).toBe(3);
  });

  it("uses the evaluated count when nothing else is known", () => {
    expect(experimentPromptCount({ config: {}, results: { total_prompts: 29 } })).toBe(29);
    expect(experimentPromptCount({ config: {}, results: undefined })).toBe(0);
  });
});
