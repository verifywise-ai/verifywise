import { composeStance, REQUIRED_SECTIONS } from "./compose";
import type { ComposeStanceArgs } from "./compose";
import { FORBIDDEN_WORDS, findForbidden } from "./vocabulary";
import type { BiasAuditResult } from "../index";
import { LL144_QUESTIONS } from "../../../structures/NYC-Local-Law-144/intake.questions";

const result = {
  metric: "selection_rate",
  tables: [
    {
      title: "Impact ratios by sex",
      categoryKey: "sex",
      rows: [
        {
          categoryType: "sex",
          categoryName: "Male",
          selectionRate: 0.4,
          impactRatio: 1,
          flagged: false,
          excluded: false,
          applicantCount: 100,
          selectedCount: 40,
        },
        {
          categoryType: "sex",
          categoryName: "Female",
          selectionRate: 0.3,
          impactRatio: 0.75,
          flagged: true,
          excluded: false,
          applicantCount: 100,
          selectedCount: 30,
        },
      ],
      highestGroup: "Male",
      highestRate: 0.4,
    },
  ],
  scoreDistributionTables: [],
  fairnessMetricsTables: [],
  overallSelectionRate: 0.35,
  overallMedian: null,
  totalApplicants: 200,
  totalSelected: 70,
  unknownCount: 7,
  flagsCount: 1,
  excludedCount: 0,
  summary: "",
  diagnostics: { degenerateMedian: null },
} as BiasAuditResult;

const base: ComposeStanceArgs = {
  projectName: "Screening tool",
  readiness: {
    score: 72,
    blockedReason: null,
    missingVetoes: [],
    openItems: [
      { key: "pipeline.preprocessing", prompt: "Is the input transformed before scoring?" },
      {
        key: "history.prior_audit",
        prompt: "Has this tool been audited for bias before, and has it changed since?",
      },
    ],
    scope: "in_scope",
    earned: 7,
    possible: 10,
  },
  gates: {
    blocked: { ratios: [], stance: [], scoring_rate: [], generation: [] },
    mayProduceStance: true,
    mayComputeRatios: true,
    mayGenerate: true,
    mayComputeScoringRate: true,
    consequences: [
      {
        kind: "scope_note",
        sourceKey: "independence.auditor",
        text:
          "Self-administered test. 5-300 requires an independent auditor. " +
          "This result is not a Local Law 144 bias audit.",
      },
      {
        kind: "scope_note",
        sourceKey: "role.party",
        text:
          "This result was commissioned by the supplier of the tool. It does not " +
          "discharge the publication duty of any employer deploying it.",
      },
      {
        kind: "limitation",
        text: "Whether the input is transformed before scoring was not established.",
      },
      {
        kind: "blank_field",
        text: "To be completed by the deploying employer or employment agency.",
        payload: { field: "distribution_date" },
      },
    ],
    forcedMetric: "selection_rate",
  },
  answers: {
    "role.party": { value: "vendor", notes: "We supply it to staffing agencies.", dontKnow: false },
    "scope.weighting": { value: "biggest", notes: "Recruiters weigh it most.", dontKnow: false },
    "independence.auditor": { value: "self", notes: "Our own team.", dontKnow: false },
    "data.held": { value: "none", notes: "We hold no demographics.", dontKnow: false },
  },
  answerAuthors: {
    "role.party": { user: "E. Editor", date: "2026-10-10" },
    "scope.weighting": { user: "A. Admin", date: "2026-10-11" },
    "independence.auditor": { user: "A. Admin", date: "2026-10-12" },
    "data.held": { user: "E. Editor", date: "2026-10-13" },
  },
  result,
  gateFindings: [
    {
      code: "unknown_share_high",
      severity: "warn",
      message: "A large share of records has no category.",
    },
    {
      code: "small_group_note",
      severity: "note",
      message: "One group is below the small-sample line.",
    },
  ],
  order: [{ attribute: "sex", observedRuns: 180, expectedRuns: 201, ratio: 0.9, blocked: false }],
  expiry: {
    date: "2027-10-14",
    trigger: "Sex trigger text. Race trigger text. Intersectional trigger text.",
  },
  derivedBasis: {
    perCategory: [
      { category: "sex", basis: "test_attribute", expiryTrigger: "Sex trigger text." },
      { category: "race_ethnicity", basis: "test_attribute", expiryTrigger: "Race trigger text." },
      {
        category: "intersectional",
        basis: "test_attribute",
        expiryTrigger: "Intersectional trigger text.",
      },
    ],
    confirmed: false,
    summary: "We read your answers as follows: no demographics are held.",
  },
  attestation: { user: "A. Admin", date: "2026-10-14" },
  jobDescriptionKey: "commercial-ae",
};

const section = (s: ReturnType<typeof composeStance>, key: string) =>
  s.sections.find((x) => x.key === key)!;

describe("required sections", () => {
  it("includes every required section", () => {
    const keys = composeStance(base).sections.map((x) => x.key);
    for (const req of REQUIRED_SECTIONS) expect(keys).toContain(req);
  });

  it("includes independence, which is the 5-300 requirement", () => {
    const ind = section(composeStance(base), "independence");
    expect(ind.body.toLowerCase()).toContain("independent auditor");
  });
});

describe("quoting rather than characterising", () => {
  it("quotes the customer's role note in the party section, not in scope", () => {
    const s = composeStance(base);
    expect(section(s, "party").body).toContain("We supply it to staffing agencies.");
    expect(section(s, "scope").body).not.toContain("We supply it to staffing agencies.");
    expect(section(s, "scope").body).toContain("Recruiters weigh it most.");
  });

  it("attributes the scope determination to the customer, not to VerifyWise", () => {
    const body = section(composeStance(base), "scope").body;
    expect(body).toMatch(/did not verify|belongs to the deploying party/i);
    expect(body).not.toMatch(/VerifyWise (found|determined|confirms)/i);
  });

  it("names the attesting user and date", () => {
    expect(composeStance(base).attestation).toEqual({ user: "A. Admin", date: "2026-10-14" });
  });

  it("prints the answering user and date beside each veto", () => {
    const s = composeStance(base);
    expect(section(s, "party").body).toContain("E. Editor");
    expect(section(s, "party").body).toContain("2026-10-10");
    expect(section(s, "scope").body).toContain("2026-10-11");
    expect(section(s, "independence").body).toContain("2026-10-12");
    expect(section(s, "basis").body).toContain("2026-10-13");
    expect(section(s, "basis").body).toContain("We hold no demographics.");
  });

  it("says plainly when the author of a veto answer is not recorded", () => {
    const s = composeStance({ ...base, answerAuthors: {} });
    expect(section(s, "party").body).toMatch(/author .*not recorded/i);
  });

  it("says an author found with a blank name is a user with no recorded name, as our own text", () => {
    const s = composeStance({
      ...base,
      answerAuthors: {
        ...base.answerAuthors,
        "role.party": { user: null, date: "2026-10-10", reason: "unnamed" },
      },
    });
    const party = section(s, "party");
    expect(party.body).toContain("Answered on 2026-10-10 by a user with no recorded name.");
    expect(party.body).not.toMatch(/author .*not recorded/i);
    // Our wording, so it is not marked as customer text, and it passes the vocabulary lint.
    expect(JSON.stringify(party.customerText ?? [])).not.toContain("no recorded name");
    expect(findForbidden(party.body)).toEqual([]);
  });

  it("keeps the not-recorded wording for an author no longer in the organization", () => {
    const s = composeStance({
      ...base,
      answerAuthors: {
        ...base.answerAuthors,
        "role.party": { user: null, date: "2026-10-10", reason: "departed" },
      },
    });
    const body = section(s, "party").body;
    expect(body).toContain("The author and date of this answer are not recorded.");
    expect(body).not.toContain("no recorded name");
  });
});

describe("the threshold is a convention", () => {
  it("states the provenance of 0.80 wherever a ratio is reported", () => {
    const body = section(composeStance(base), "results").body;
    expect(body).toMatch(/four-fifths/i);
    expect(body).toMatch(/does not adopt|convention/i);
  });

  it("reports a flagged ratio as a finding, not a failure", () => {
    const body = section(composeStance(base), "results").body;
    expect(body).not.toMatch(/\bfail(ed|s)?\b/i);
    expect(body).toContain("0.75");
  });

  it("reports the unknown-category count", () => {
    const body = section(composeStance(base), "results").body;
    expect(body).toMatch(/7 .*unknown|unknown.*\b7\b/i);
    expect(body).toContain("5-301(c)");
  });
});

describe("the role tested is named", () => {
  it("states which job description was used and what the result describes", () => {
    const body = section(composeStance(base), "what_was_tested").body;
    expect(body).toMatch(/account executive|commercial/i);
    expect(body).toMatch(/on that role|not across/i);
  });

  it("leaves a blank field when no job description is recorded", () => {
    const s = composeStance({ ...base, jobDescriptionKey: null });
    expect(s.blankFields.map((b) => b.field)).toContain("job_description");
  });
});

describe("derived basis", () => {
  it("shows the split as our reading and lists it as an open item while unconfirmed", () => {
    const s = composeStance(base);
    expect(section(s, "basis").body).toMatch(/we read your answers/i);
    expect(s.openItems.join(" ")).toMatch(/confirm/i);
    expect(s.derivedBasis).toBe(base.derivedBasis);
  });

  it("has no unconfirmed-split open item once confirmed", () => {
    const s = composeStance({ ...base, derivedBasis: { ...base.derivedBasis!, confirmed: true } });
    expect(s.openItems.join(" ")).not.toMatch(/confirm the split|confirm how we read/i);
  });

  it("does not ask for a confirmation it then says was given, or print the reading twice", () => {
    const summary =
      "We read your answers as follows: sex: test data. Please confirm it or correct it.";
    const body = section(
      composeStance({
        ...base,
        derivedBasis: { ...base.derivedBasis!, summary, confirmed: true },
      }),
      "basis",
    ).body;
    expect(body).toContain("You have confirmed this reading.");
    expect(body).not.toMatch(/please confirm/i);
    expect(body).not.toContain(summary);
  });

  it("speaks to each category's own trigger", () => {
    const body = section(composeStance(base), "expiry").body;
    expect(body).toContain("Sex trigger text.");
    expect(body).toContain("Race trigger text.");
  });
});

describe("gate findings", () => {
  it("carries warn and note findings", () => {
    const body = section(composeStance(base), "data_relied_on").body;
    expect(body).toContain("A large share of records has no category.");
    expect(body).toContain("One group is below the small-sample line.");
  });

  it("carries order findings and flags a blocked one as open", () => {
    const s = composeStance({
      ...base,
      order: [
        { attribute: "sex", observedRuns: 10, expectedRuns: 200, ratio: 0.05, blocked: true },
      ],
    });
    expect(section(s, "data_relied_on").body).toContain(
      "- Sex: 10 runs observed against 200.0 expected",
    );
    expect(s.openItems.join(" ")).toMatch(/row-order/i);
  });

  it("names the order check's attribute by its label and rounds the expected count", () => {
    const s = composeStance({
      ...base,
      order: [
        {
          attribute: "race_ethnicity",
          observedRuns: 2045,
          expectedRuns: 2057.003333333333,
          ratio: 0.99,
          blocked: true,
        },
      ],
    });
    const body = section(s, "data_relied_on").body;
    expect(body).toContain("- Race and ethnicity: 2045 runs observed against 2057.0 expected");
    expect(body).not.toContain("race_ethnicity");
    expect(body).not.toContain("2057.0033");
    expect(s.openItems.join(" ")).toContain("Row-order check for Race and ethnicity");
  });
});

describe("a stored stop has no result", () => {
  const stopped: ComposeStanceArgs = {
    ...base,
    result: null,
    gateFindings: [
      {
        code: "mapping_column_absent",
        severity: "stop",
        message: "Column Sex is not in the file.",
      },
    ],
  };

  it("invents no numbers and names the stop", () => {
    const s = composeStance(stopped);
    const body = section(s, "results").body;
    expect(body).toContain("Column Sex is not in the file.");
    expect(body).toMatch(/no ratios were computed/i);
    expect(body).not.toMatch(/0\.\d\d/);
    expect(s.openItems.join(" ")).toContain("Column Sex is not in the file.");
  });
});

describe("the out-of-scope variant", () => {
  const oos: ComposeStanceArgs = {
    ...base,
    readiness: { ...base.readiness, score: null, scope: "out_of_scope", openItems: [] },
    answers: {
      ...base.answers,
      "scope.weighting": {
        value: "one_of_several",
        notes: "One of several inputs, no extra weight.",
        dontKnow: false,
      },
    },
    result: null,
    derivedBasis: base.derivedBasis,
    gateFindings: [],
  };

  it("is headed Scope determination, not Result", () => {
    expect(composeStance(oos).heading).toBe("Scope determination");
    expect(composeStance(oos).scope).toBe("out_of_scope");
  });

  it("branches on readiness, not on mayGenerate (which stays true)", () => {
    expect(oos.gates.mayGenerate).toBe(true);
    expect(composeStance(oos).scope).toBe("out_of_scope");
  });

  it("carries no ratios, basis, data section, derived split or score", () => {
    const s = composeStance(oos);
    const keys = s.sections.map((x) => x.key);
    for (const k of ["results", "basis", "what_was_tested", "data_relied_on", "readiness"]) {
      expect(keys).not.toContain(k);
    }
    expect(s.derivedBasis).toBeNull();
    expect(s.blankFields).toEqual([]);
  });

  it("states that a change in use may bring the tool into scope", () => {
    expect(section(composeStance(oos), "scope").body).toMatch(
      /may bring (the tool|it) into scope|revisit/i,
    );
  });

  it("quotes the customer and names who answered", () => {
    const body = section(composeStance(oos), "scope").body;
    expect(body).toContain("One of several inputs, no extra weight.");
    expect(body).toContain("A. Admin");
  });

  it("lists the customer's note in `customerText` so the renderer can mark it structurally", () => {
    const sec = section(composeStance(oos), "scope");
    expect(sec.customerText).toContainEqual({
      lead: `In your words: "`,
      text: "One of several inputs, no extra weight.",
      tail: `"`,
    });
    expect(sec.body).toContain(`In your words: "One of several inputs, no extra weight."`);
  });

  it("does not read as a clearance", () => {
    const all = composeStance(oos)
      .sections.map((x) => x.body)
      .join(" ")
      .toLowerCase();
    expect(all).not.toMatch(/no action (is )?required|clear(ed)?( of)? bias|satisfies/);
  });
});

describe("an undetermined scope", () => {
  it("states scope is not established and carries no result sections", () => {
    const s = composeStance({
      ...base,
      readiness: {
        ...base.readiness,
        score: null,
        scope: "undetermined",
        missingVetoes: ["scope.weighting"],
        blockedReason: "Scope is not established: answer scope.weighting.",
      },
      result: null,
    });
    expect(s.scope).toBe("undetermined");
    expect(s.sections.map((x) => x.key)).not.toContain("results");
    expect(s.openItems.join(" ")).toMatch(/biggest single factor/i);
  });
});

describe("fix round 1", () => {
  it("routes the independence note to independence and the vendor note to party", () => {
    const s = composeStance(base);
    expect(section(s, "independence").body).toContain("not a Local Law 144 bias audit");
    expect(section(s, "scope").body).not.toContain("not a Local Law 144 bias audit");
    expect(section(s, "party").body).toContain("does not discharge the publication duty");
    expect(section(s, "scope").body).not.toContain("does not discharge the publication duty");
  });

  it("carries the not-determined note and the limb in the out-of-scope scope body", () => {
    const s = composeStance({
      ...base,
      readiness: { ...base.readiness, score: null, scope: "out_of_scope", openItems: [] },
      answers: {
        ...base.answers,
        "scope.weighting": { value: "one_of_several", notes: "One input.", dontKnow: false },
      },
      gates: {
        ...base.gates,
        consequences: [
          {
            kind: "scope_note",
            sourceKey: "scope.weighting",
            text:
              "VerifyWise did not verify this and does not determine whether any deployment " +
              "is an automated employment decision tool.",
          },
        ],
      },
      result: null,
      gateFindings: [],
    });
    const body = section(s, "scope").body;
    expect(body).toContain("does not determine whether any deployment");
    expect(body).toContain("5-300 definition");
    // The intake's own guidance is not repeated in the document.
    expect(body).not.toMatch(/you receive a scope determination/i);
    expect(body).not.toMatch(/remaining questions/i);
  });

  it("rewords an open item whose question text carries a forbidden word", () => {
    const s = composeStance(base);
    const all = s.openItems.join(" ").toLowerCase();
    expect(all).not.toContain("audited");
    expect(all).toMatch(/bias review/);
  });

  it("carries the readiness score and says it is VerifyWise's own construct", () => {
    const s = composeStance(base);
    const r = section(s, "readiness");
    expect(r.body).toContain("72");
    expect(r.body).toMatch(/VerifyWise's own/i);
    expect(r.body).toMatch(/measure of how ready you are to commission an independent audit/i);
    expect(r.body).toMatch(/not a finding of compliance/i);
    expect(r.body).not.toMatch(/about the tool/i);
  });

  it("states an expiry of the result with its date", () => {
    const body = section(composeStance(base), "expiry").body;
    expect(body).toContain("This result expires on 2027-10-14 (5-301(a))");
    expect(body).not.toContain("dated to");
  });

  it("prints each expiry trigger once", () => {
    const body = section(composeStance(base), "expiry").body;
    expect(body.split("Sex trigger text.").length - 1).toBe(1);
  });

  it("gives the out-of-scope expiry no basis trigger", () => {
    const s = composeStance({
      ...base,
      readiness: { ...base.readiness, score: null, scope: "out_of_scope", openItems: [] },
      result: null,
    });
    expect(section(s, "expiry").body).not.toContain("Sex trigger text.");
    expect(s.expiry.trigger).toBe("");
  });

  it("names undetermined open items by question text without repeating the blocked reason", () => {
    const s = composeStance({
      ...base,
      readiness: {
        ...base.readiness,
        score: null,
        scope: "undetermined",
        missingVetoes: ["scope.weighting"],
        blockedReason: "Scope is not established: answer scope.weighting.",
      },
      result: null,
    });
    expect(s.openItems.join(" ")).not.toContain("scope.weighting");
    expect(s.openItems.join(" ")).toMatch(/weigh|look|output/i);
    expect(section(s, "scope").body).toContain("a required answer is missing");
  });
});

describe("customer-authored text is listed for marking", () => {
  it("lists the tool name and the answering user beside each veto, with their surroundings", () => {
    const sec = section(composeStance(base), "scope");
    expect(sec.customerText).toContainEqual({ lead: "Tool: ", text: "Screening tool", tail: "." });
    expect(sec.customerText).toContainEqual({
      lead: "Answered by ",
      text: "A. Admin",
      tail: " on 2026-10-11.",
    });
  });

  it("lists the note in the party section too", () => {
    const sec = section(composeStance(base), "party");
    expect(sec.customerText?.map((c) => c.text)).toEqual([
      "We supply it to staffing agencies.",
      "E. Editor",
    ]);
  });

  it("never alters the customer's text", () => {
    const m = composeStance({ ...base, projectName: "Certified Candidate Ranker" });
    expect(section(m, "scope").body).toContain("Tool: Certified Candidate Ranker.");
  });
});

describe("blank fields", () => {
  it("renders the distribution date as visibly blank with an instruction", () => {
    const s = composeStance(base);
    expect(s.blankFields).toEqual([expect.objectContaining({ field: "distribution_date" })]);
    expect(s.blankFields[0].instruction).toContain("deploying employer");
  });

  it("gives instructions without the field's name, which the renderer prints once as the label", () => {
    // Every blank field the question set emits, plus the one compose adds.
    const emitted = LL144_QUESTIONS.flatMap((q) => q.options).flatMap((o) =>
      (o.emits ?? []).filter((e) => e.kind === "blank_field").map((e) => e.text),
    );
    expect(emitted.length).toBeGreaterThan(0);
    const added = composeStance({ ...base, jobDescriptionKey: null }).blankFields.map(
      (f) => f.instruction,
    );
    for (const text of [...emitted, ...added]) {
      expect(text).toMatch(/^To be completed by /);
    }
  });
});

describe("heading", () => {
  it("names what the in-scope document is", () => {
    expect(composeStance(base).heading).toBe("Local Law 144 self-administered bias test");
  });
});

describe("vocabulary", () => {
  it("never uses forbidden words, for in-scope, stopped and out-of-scope documents", () => {
    const docs = [
      composeStance(base),
      composeStance({ ...base, result: null }),
      composeStance({ ...base, readiness: { ...base.readiness, scope: "out_of_scope" } }),
    ];
    for (const d of docs) {
      const all = JSON.stringify(d).toLowerCase();
      for (const w of FORBIDDEN_WORDS) expect(all).not.toContain(w);
    }
  });

  it("does not call the run an audit finding", () => {
    const all = composeStance(base)
      .sections.map((x) => x.body)
      .join(" ");
    expect(all).not.toMatch(/this audit (found|shows|concludes)/i);
  });

  it("states no count of intersectional categories or cells", () => {
    const all = composeStance(base)
      .sections.map((x) => x.body)
      .join(" ");
    expect(all).not.toMatch(/\b\d+\s+(intersectional|cells|categories)/i);
  });
});

describe("impact ratios in the results", () => {
  it("never prints a flagged ratio as 0.80", () => {
    const close = {
      ...result,
      tables: [
        {
          ...result.tables[0],
          rows: [result.tables[0].rows[0], { ...result.tables[0].rows[1], impactRatio: 0.7996 }],
        },
      ],
    } as BiasAuditResult;
    const body = section(composeStance({ ...base, result: close }), "results").body;
    expect(body).toContain("impact ratio 0.79 (below the 0.80 convention)");
    expect(body).not.toContain("impact ratio 0.80");
  });
});
