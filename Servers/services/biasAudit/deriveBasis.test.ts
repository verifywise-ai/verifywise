import { deriveBasis } from "./deriveBasis";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value: v, dontKnow: false }]));

const find = (d: ReturnType<typeof deriveBasis>, c: string) =>
  d!.perCategory.find((x) => x.category === c)!;

describe("the split that a single answer would flatten", () => {
  // One engagement held sex for ~1,500-2,000 candidates and no race or
  // ethnicity at all. Sex was auditable from historical data; race and the
  // intersectional categories were not.
  it("splits sex from race when only sex is held", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(find(d, "sex").basis).toBe("historical");
    expect(find(d, "race_ethnicity").basis).toBe("test_attribute");
    expect(find(d, "intersectional").basis).toBe("test_attribute");
  });

  it("gives the race basis an expiry that sex volume cannot satisfy", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    const race = find(d, "race_ethnicity");
    expect(race.expiryTrigger).toMatch(/race and ethnicity/i);
    expect(race.expiryTrigger).not.toMatch(/sex/i);
    // The sex category has nothing to expire.
    expect(find(d, "sex").expiryTrigger).toBe("");
  });
});

describe("the uniform cases", () => {
  it("marks every category test_attribute when nothing is held", () => {
    const d = deriveBasis(a({ "data.held": "none", "data.basis": "test_attribute" }));
    expect(d!.perCategory.every((c) => c.basis === "test_attribute")).toBe(true);
  });

  it("marks every category historical when all is held sufficiently", () => {
    const d = deriveBasis(a({ "data.held": "all_sufficient", "data.basis": "historical" }));
    expect(d!.perCategory.every((c) => c.basis === "historical")).toBe(true);
    expect(d!.perCategory.every((c) => c.expiryTrigger === "")).toBe(true);
  });

  it("uses volume, not attribute, when all is held at low volume", () => {
    const d = deriveBasis(a({ "data.held": "all_low_volume", "data.basis": "test_volume" }));
    expect(find(d, "race_ethnicity").basis).toBe("test_volume");
    expect(find(d, "race_ethnicity").expiryTrigger).toMatch(/volume/i);
  });

  it("uses availability when the customers hold it", () => {
    const d = deriveBasis(
      a({ "data.held": "customers_hold_it", "data.basis": "test_availability" }),
    );
    expect(d!.perCategory.every((c) => c.basis === "test_availability")).toBe(true);
    expect(find(d, "sex").expiryTrigger).toMatch(/become available/i);
  });
});

describe("the intersection needs both halves", () => {
  it("is never historical unless both sex and race are", () => {
    for (const held of ["sex_only", "none", "customers_hold_it", "all_low_volume"]) {
      for (const basis of ["test_attribute", "historical"]) {
        const d = deriveBasis(a({ "data.held": held, "data.basis": basis }));
        expect(find(d, "intersectional").basis).not.toBe("historical");
      }
    }
    const all = deriveBasis(a({ "data.held": "all_sufficient", "data.basis": "historical" }));
    expect(find(all, "intersectional").basis).toBe("historical");
  });
});

describe("a stated historical basis cannot cover what is not held", () => {
  it("none + historical makes every category test_attribute with a trigger", () => {
    const d = deriveBasis(a({ "data.held": "none", "data.basis": "historical" }));
    for (const c of ["sex", "race_ethnicity", "intersectional"]) {
      expect(find(d, c).basis).toBe("test_attribute");
      expect(find(d, c).expiryTrigger).not.toBe("");
    }
  });

  it("sex_only + historical keeps sex historical and moves race and the intersection", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "historical" }));
    expect(find(d, "sex").basis).toBe("historical");
    expect(find(d, "sex").expiryTrigger).toBe("");
    expect(find(d, "race_ethnicity").basis).toBe("test_attribute");
    expect(find(d, "race_ethnicity").expiryTrigger).toMatch(/race and ethnicity/i);
    expect(find(d, "intersectional").basis).toBe("test_attribute");
    expect(find(d, "intersectional").expiryTrigger).not.toBe("");
  });
});

describe("the intersectional trigger", () => {
  it("requires both sex and race for test_attribute", () => {
    const d = deriveBasis(a({ "data.held": "none", "data.basis": "test_attribute" }));
    const t = find(d, "intersectional").expiryTrigger;
    expect(t).toMatch(/both sex and race and ethnicity/i);
    expect(t).toMatch(/either one alone does not end it/i);
  });

  it("cites 5-301(c) only and states no count", () => {
    const d = deriveBasis(a({ "data.held": "all_low_volume", "data.basis": "test_volume" }));
    for (const c of d!.perCategory) {
      expect(c.expiryTrigger).toMatch(/5-301\(c\)/);
      expect(c.expiryTrigger).not.toMatch(/\(4\)|\(iii\)|\d+ intersectional/);
    }
  });
});

describe("invalid input", () => {
  it("returns null for an unknown data.held value", () => {
    expect(deriveBasis(a({ "data.held": "mystery", "data.basis": "historical" }))).toBeNull();
  });

  it("returns null for an invalid data.basis value", () => {
    expect(deriveBasis(a({ "data.held": "none", "data.basis": "bogus" }))).toBeNull();
  });

  it("treats an empty-string answer as unanswered", () => {
    expect(deriveBasis(a({ "data.held": "", "data.basis": "historical" }))).toBeNull();
    expect(deriveBasis(a({ "data.held": "none", "data.basis": "" }))).toBeNull();
  });
});

describe("it is an inference, not a statement", () => {
  it("starts unconfirmed", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(d!.confirmed).toBe(false);
  });

  it("summarises in words that attribute the reading to us", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(d!.summary).toMatch(/we read your answers/i);
    expect(d!.summary).not.toMatch(/you (stated|said|confirmed)/i);
  });
});

describe("missing input", () => {
  it("returns null when the data basis is unanswered", () => {
    expect(deriveBasis(a({ "data.held": "sex_only" }))).toBeNull();
  });

  it("returns null when the veto is unanswered", () => {
    expect(deriveBasis(a({ "data.basis": "test_attribute" }))).toBeNull();
  });

  it("returns null on a don't-know for either", () => {
    expect(
      deriveBasis({
        "data.held": { value: null, dontKnow: true },
        "data.basis": { value: "test_attribute", dontKnow: false },
      }),
    ).toBeNull();
  });
});

describe("each trigger speaks only about its own category", () => {
  const cases: Array<[string, string]> = [
    ["none", "test_attribute"],
    ["sex_only", "test_attribute"],
    ["all_low_volume", "test_volume"],
    ["customers_hold_it", "test_availability"],
  ];
  it("never names race or ethnicity in a sex trigger", () => {
    for (const [held, basis] of cases) {
      const d = deriveBasis(a({ "data.held": held, "data.basis": basis }));
      expect(find(d, "sex").expiryTrigger).not.toMatch(/race|ethnic/i);
    }
  });
  it("never names sex in a race trigger", () => {
    for (const [held, basis] of cases) {
      const d = deriveBasis(a({ "data.held": held, "data.basis": basis }));
      expect(find(d, "race_ethnicity").expiryTrigger).not.toMatch(/\bsex\b/i);
    }
  });
});
