import { FORBIDDEN_WORDS } from "../../services/biasAudit/stance/vocabulary";
import { LL144_QUESTIONS, LL144_QUESTION_SET_VERSION, VETO_KEYS } from "./intake.questions";

describe("question set shape", () => {
  it("is version 1", () => {
    expect(LL144_QUESTION_SET_VERSION).toBe(1);
  });

  it("has exactly four veto questions, all at profile scope", () => {
    const vetoes = LL144_QUESTIONS.filter((q) => q.weight === "veto");
    expect(vetoes).toHaveLength(4);
    expect(vetoes.map((q) => q.key).sort()).toEqual([
      "data.held",
      "independence.auditor",
      "role.party",
      "scope.weighting",
    ]);
    expect(vetoes.every((q) => q.scope === "profile")).toBe(true);
    expect(VETO_KEYS.slice().sort()).toEqual(vetoes.map((q) => q.key).sort());
  });

  it("requires verbatim notes on every veto question", () => {
    for (const q of LL144_QUESTIONS.filter((x) => x.weight === "veto")) {
      expect(q.notesRequired).toBe(true);
      expect(q.notesPrompt).toBeTruthy();
    }
  });

  it("has unique keys", () => {
    const keys = LL144_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every question at least two options", () => {
    for (const q of LL144_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      const values = q.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("consequences are stated before the customer answers", () => {
  it("gives every option of a tier-2 question a consequence", () => {
    const tier2 = [
      "cutoff.applied_by",
      "cutoff.planned",
      "knockout.exists",
      "pipeline.input_form",
      "pipeline.preprocessing",
      "history.prior_audit",
      "threshold.operational",
    ];
    for (const key of tier2) {
      const q = LL144_QUESTIONS.find((x) => x.key === key)!;
      expect(q).toBeDefined();
      for (const o of q.options) {
        expect(o.consequence).toBeTruthy();
      }
    }
  });

  it("forces the metric when a person applies the cutoff", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "cutoff.applied_by")!;
    const person = q.options.find((o) => o.value === "person")!;
    expect(person.emits).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "metric_forced" })]),
    );
    const platform = q.options.find((o) => o.value === "platform")!;
    expect(platform.emits).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "metric_forced" })]),
    );
  });

  it("emits a limitation when anything pre-processes the input", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "pipeline.preprocessing")!;
    const yes = q.options.find((o) => o.value === "yes")!;
    expect(yes.emits![0].kind).toBe("limitation");
    expect(yes.emits![0].text.toLowerCase()).toContain("scored input");
  });

  it("emits a blank distribution-date field for a vendor", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "role.party")!;
    const vendor = q.options.find((o) => o.value === "vendor")!;
    const blank = vendor.emits!.find((e) => e.kind === "blank_field")!;
    expect(blank.payload!.field).toBe("distribution_date");
    expect(blank.text).toContain("deploying employer or employment agency");
  });
});

describe("scope short-circuit", () => {
  it("offers 'one of several' on the weighting question", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "scope.weighting")!;
    expect(q.options.map((o) => o.value)).toEqual(
      expect.arrayContaining(["only", "biggest", "one_of_several"]),
    );
    expect(q.options.map((o) => o.value)).toContain("overrules");
  });

  it("makes every non-veto question conditional on scope not being out", () => {
    const nonVeto = LL144_QUESTIONS.filter((q) => q.weight !== "veto");
    expect(nonVeto.length).toBeGreaterThan(0);
    for (const q of nonVeto) {
      expect(q.appliesWhen).toBeDefined();
    }
  });
});

describe("gates", () => {
  it("gates generation on the input form, because it cannot be detected", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "pipeline.input_form")!;
    expect(q.gates).toContain("generation");
    expect(q.weight).toBe("high");
  });

  it("gates only the scoring-rate output on the operational threshold", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "threshold.operational")!;
    expect(q.gates).toEqual(["scoring_rate"]);
    expect(q.weight).toBe("low");
  });

  it("gates the stance on the data basis without making it a veto", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "data.basis")!;
    expect(q.gates).toContain("stance");
    expect(q.weight).not.toBe("veto");
  });
});

describe("statutory references", () => {
  it("cites a section on every question that claims one", () => {
    const cited = LL144_QUESTIONS.filter((q) => q.statutoryRef);
    expect(cited.length).toBeGreaterThanOrEqual(4);
    for (const q of cited) {
      expect(q.statutoryRef).toMatch(/^(6 RCNY )?5-30[0-4](\([a-d]\))?$|^20-871/);
    }
  });

  it("does not cite 5-301(a) for anything but the one-year expiry", () => {
    // A prior report cited 5-301(a) for re-audit triggers it does not contain
    // and the claim had to be withdrawn. The rule has no trigger for role,
    // configuration, weighting or model change.
    for (const q of LL144_QUESTIONS) {
      if (q.statutoryRef === "5-301(a)") {
        expect(q.key).toBe("history.prior_audit");
      }
    }
  });
});

describe("vocabulary", () => {
  it("never uses a forbidden word in any customer-facing text", () => {
    const text = LL144_QUESTIONS.flatMap((q) =>
      q.options.flatMap((o) => [o.consequence ?? "", ...(o.emits ?? []).map((e) => e.text)]),
    )
      .join(" ")
      .toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      expect(text).not.toContain(word);
    }

    // Prompts and labels: 'audited' is allowed only on the prior-audit question.
    for (const q of LL144_QUESTIONS) {
      const text = [q.prompt, q.notesPrompt ?? "", ...q.options.map((o) => o.label)]
        .join(" ")
        .toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        if (word === "audited" && q.key === "history.prior_audit") continue;
        expect({ key: q.key, word, found: text.includes(word) }).toEqual({
          key: q.key,
          word,
          found: false,
        });
      }
    }
  });
});
