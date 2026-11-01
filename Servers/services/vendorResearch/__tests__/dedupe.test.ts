import {
  FindingSource,
  IVendorRiskFinding,
  NewFinding,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  ACTIVE_RISK_THRESHOLD,
  DedupeReport,
  PRIOR_FINDING_THRESHOLD,
  dropDuplicates,
} from "../dedupe";

// The tokeniser keeps words of three or more letters or digits, so a text made of such words has
// exactly those words as its tokens and the Jaccard score of two texts can be worked out by hand:
// the words they share over the words in either of them.

const SOURCE_URL = "https://news.example.com/story";

function cited(url: string): FindingSource {
  return { url, title: "Title", quote: "A quote.", published_at: null };
}

/** A candidate whose description holds `words` and whose impact holds `impactWords`. */
function candidate(
  words: string[],
  overrides: Partial<NewFinding> = {},
  impactWords: string[] = [],
): NewFinding {
  return {
    category: "security_incidents",
    risk_description: words.join(" "),
    impact_description: impactWords.join(" "),
    action_plan: "Ask the vendor.",
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High Risk",
    rationale: null,
    sources: [cited(SOURCE_URL)],
    ...overrides,
  };
}

function risk(words: string[], impactWords: string[] = []) {
  return { risk_description: words.join(" "), impact_description: impactWords.join(" ") };
}

type Prior = Pick<
  IVendorRiskFinding,
  "category" | "risk_description" | "impact_description" | "sources"
>;

function prior(words: string[], overrides: Partial<Prior> = {}, impactWords: string[] = []): Prior {
  return {
    category: "security_incidents",
    risk_description: words.join(" "),
    impact_description: impactWords.join(" "),
    sources: [cited("https://elsewhere.example.org/other")],
    ...overrides,
  };
}

const descriptionOf = (finding: NewFinding) => finding.risk_description;

describe("thresholds", () => {
  it("are 0.25 against the active risks and 0.4 against the earlier findings", () => {
    expect(ACTIVE_RISK_THRESHOLD).toBe(0.25);
    expect(PRIOR_FINDING_THRESHOLD).toBe(0.4);
  });
});

describe("dropDuplicates", () => {
  it("keeps everything when there is nothing to compare with", () => {
    const candidates = [candidate(["alpha", "bravo"]), candidate(["charlie", "delta"])];

    expect(dropDuplicates(candidates, [], [])).toEqual({ kept: candidates, dropped: 0 });
  });

  it("returns nothing for no candidates", () => {
    expect(dropDuplicates([], [risk(["alpha"])], [prior(["alpha"])])).toEqual({
      kept: [],
      dropped: 0,
    });
  });

  describe("against the active risks of the vendor", () => {
    it("drops a candidate whose overlap is exactly 0.25", () => {
      // {alpha, bravo} against {alpha, charlie, delta}: one shared word out of four.
      const result = dropDuplicates(
        [candidate(["alpha", "bravo"])],
        [risk(["alpha", "charlie", "delta"])],
        [],
      );

      expect(result).toEqual({ kept: [], dropped: 1 });
    });

    it("keeps a candidate whose overlap is just under 0.25", () => {
      // One shared word out of five.
      const candidates = [candidate(["alpha", "bravo"])];

      const result = dropDuplicates(candidates, [risk(["alpha", "charlie", "delta", "echo"])], []);

      expect(result).toEqual({ kept: candidates, dropped: 0 });
    });

    it("drops a candidate that repeats a risk word for word", () => {
      const result = dropDuplicates(
        [candidate(["alpha", "bravo", "charlie"])],
        [risk(["alpha", "bravo", "charlie"])],
        [],
      );

      expect(result.dropped).toBe(1);
    });

    it("compares the description and the impact together, not field by field", () => {
      // The words are the same but sit in the other field.
      const result = dropDuplicates(
        [candidate(["alpha", "bravo"], {}, ["charlie", "delta"])],
        [risk(["charlie", "delta"], ["alpha", "bravo"])],
        [],
      );

      expect(result.dropped).toBe(1);
    });

    it("compares with every active risk and drops on the first that is close enough", () => {
      const result = dropDuplicates(
        [candidate(["alpha", "bravo", "charlie"])],
        [
          risk(["xray", "yankee", "zulu"]),
          risk(["whiskey", "victor", "uniform"]),
          risk(["alpha", "bravo", "charlie", "delta"]),
        ],
        [],
      );

      expect(result.dropped).toBe(1);
    });

    it("ignores the category and the sources: only the words count", () => {
      const result = dropDuplicates(
        [candidate(["alpha", "bravo"], { category: "legal_regulatory" })],
        [risk(["alpha", "bravo"])],
        [],
      );

      expect(result.dropped).toBe(1);
    });

    // The columns of the register are nullable, though the type of a risk says string. A missing
    // text counts as no words. Read as the word null it would be one more word that no candidate
    // shares, and the overlap of a risk would fall short of the threshold.
    it.each([
      ["impact", { risk_description: "alpha charlie delta", impact_description: null }],
      ["description", { risk_description: null, impact_description: "alpha charlie delta" }],
    ])("reads a register risk with no %s as no words, not as the word null", (_missing, row) => {
      // One shared word out of four: exactly 0.25.
      const result = dropDuplicates([candidate(["alpha", "bravo"])], [row], []);

      expect(result).toEqual({ kept: [], dropped: 1 });
    });

    it("never matches a register risk that has no text at all", () => {
      // Read as the words null and null, it would match a candidate that says "null".
      const candidates = [candidate(["null"])];
      const empty = { risk_description: null, impact_description: null };

      expect(dropDuplicates(candidates, [empty], [])).toEqual({ kept: candidates, dropped: 0 });
    });
  });

  describe("against the earlier findings of the vendor", () => {
    it("drops a candidate whose overlap is exactly 0.4", () => {
      // {alpha, bravo, charlie} against {alpha, bravo, delta, echo}: two shared words out of five.
      const result = dropDuplicates(
        [candidate(["alpha", "bravo", "charlie"])],
        [],
        [prior(["alpha", "bravo", "delta", "echo"])],
      );

      expect(result).toEqual({ kept: [], dropped: 1 });
    });

    it("keeps a candidate whose overlap is under 0.4, though an active risk at that overlap would drop it", () => {
      // Two shared words out of six: 0.33.
      const candidates = [candidate(["alpha", "bravo", "charlie"])];
      const words = ["alpha", "bravo", "delta", "echo", "foxtrot"];

      expect(dropDuplicates(candidates, [], [prior(words)])).toEqual({
        kept: candidates,
        dropped: 0,
      });
      expect(dropDuplicates(candidates, [risk(words)], []).dropped).toBe(1);
    });

    it("drops a duplicate of a finding that was accepted or dismissed as well as of one that is pending", () => {
      const words = ["alpha", "bravo", "charlie"];
      for (const status of ["pending", "accepted", "dismissed"] as const) {
        const earlier: Prior & Pick<IVendorRiskFinding, "status"> = { ...prior(words), status };

        const result = dropDuplicates([candidate(words)], [], [earlier]);

        expect(result.dropped).toBe(1);
      }
    });

    it("reads the description and the impact together", () => {
      const result = dropDuplicates(
        [candidate(["alpha", "bravo"], {}, ["charlie", "delta"])],
        [],
        [prior(["charlie", "delta"], {}, ["alpha", "bravo"])],
      );

      expect(result.dropped).toBe(1);
    });

    it("drops a candidate of the same category that shares a source URL, whatever the words", () => {
      const result = dropDuplicates(
        [candidate(["alpha", "bravo"], { sources: [cited(SOURCE_URL)] })],
        [],
        [prior(["xray", "yankee"], { sources: [cited(SOURCE_URL)] })],
      );

      expect(result).toEqual({ kept: [], dropped: 1 });
    });

    it("finds the shared URL among several sources on either side", () => {
      const result = dropDuplicates(
        [
          candidate(["alpha", "bravo"], {
            sources: [cited("https://a.example.com/1"), cited(SOURCE_URL)],
          }),
        ],
        [],
        [
          prior(["xray", "yankee"], {
            sources: [
              cited("https://b.example.com/2"),
              cited("https://c.example.com/3"),
              cited(SOURCE_URL),
            ],
          }),
        ],
      );

      expect(result.dropped).toBe(1);
    });

    it("keeps a candidate that shares a source URL with a finding of another category", () => {
      const candidates = [
        candidate(["alpha", "bravo"], {
          category: "legal_regulatory",
          sources: [cited(SOURCE_URL)],
        }),
      ];

      const result = dropDuplicates(
        candidates,
        [],
        [
          prior(["xray", "yankee"], {
            category: "security_incidents",
            sources: [cited(SOURCE_URL)],
          }),
        ],
      );

      expect(result).toEqual({ kept: candidates, dropped: 0 });
    });

    it("compares URLs as exact strings", () => {
      const candidates = [candidate(["alpha", "bravo"], { sources: [cited(SOURCE_URL)] })];
      const sameUpToTheString: string[] = [
        `${SOURCE_URL}/`,
        SOURCE_URL.toUpperCase(),
        `${SOURCE_URL}?utm_source=a`,
        `${SOURCE_URL}#top`,
        SOURCE_URL.replace("https:", "http:"),
      ];

      for (const url of sameUpToTheString) {
        const result = dropDuplicates(
          candidates,
          [],
          [prior(["xray", "yankee"], { sources: [cited(url)] })],
        );

        expect(result).toEqual({ kept: candidates, dropped: 0 });
      }
    });

    it("keeps a candidate when the earlier finding in its category cites other pages and says other things", () => {
      const candidates = [candidate(["alpha", "bravo"])];

      const result = dropDuplicates(candidates, [], [prior(["xray", "yankee"])]);

      expect(result.kept).toEqual(candidates);
    });

    it("works with earlier findings that cite no source", () => {
      const candidates = [candidate(["alpha", "bravo"])];

      expect(dropDuplicates(candidates, [], [prior(["xray", "yankee"], { sources: [] })])).toEqual({
        kept: candidates,
        dropped: 0,
      });
    });
  });

  describe("within the run", () => {
    it("keeps the first of two similar candidates", () => {
      const first = candidate(["alpha", "bravo", "charlie"], { risk_severity: "Catastrophic" });
      const second = candidate(["alpha", "bravo", "charlie", "delta"], { risk_severity: "Minor" });

      const result = dropDuplicates([first, second], [], []);

      expect(result).toEqual({ kept: [first], dropped: 1 });
    });

    it("drops a second candidate at exactly 0.4 and keeps one under it", () => {
      const first = candidate(["alpha", "bravo", "charlie"]);
      const atTheThreshold = candidate(["alpha", "bravo", "delta", "echo"]);
      const underIt = candidate(["alpha", "bravo", "delta", "echo", "foxtrot"]);

      expect(dropDuplicates([first, atTheThreshold], [], []).kept).toEqual([first]);
      expect(dropDuplicates([first, underIt], [], []).kept).toEqual([first, underIt]);
    });

    it("does not use the 0.25 of the register inside a run", () => {
      // One shared word out of four: 0.25, which would drop the second against an active risk.
      const first = candidate(["alpha", "bravo"]);
      const second = candidate(["alpha", "charlie", "delta"]);

      expect(dropDuplicates([first, second], [], []).kept).toEqual([first, second]);
      expect(dropDuplicates([second], [risk(["alpha", "bravo"])], []).dropped).toBe(1);
    });

    it("does not treat a shared source URL as a duplicate inside a run", () => {
      const first = candidate(["alpha", "bravo"], { sources: [cited(SOURCE_URL)] });
      const second = candidate(["xray", "yankee"], { sources: [cited(SOURCE_URL)] });

      expect(dropDuplicates([first, second], [], []).kept).toEqual([first, second]);
    });

    it("compares a candidate with the ones that were kept, not with the ones that were dropped", () => {
      const first = candidate(["alpha", "bravo", "charlie", "delta", "echo"]);
      const droppedAsDuplicate = candidate(["alpha", "bravo", "charlie", "delta", "foxtrot"]);
      // Close to the dropped one (2 of 5 = 0.4) but not to the kept one (1 of 6).
      const third = candidate(["delta", "foxtrot"]);

      const result = dropDuplicates([first, droppedAsDuplicate, third], [], []);

      expect(result.kept).toEqual([first, third]);
      expect(result.dropped).toBe(1);
    });
  });

  describe("the events of the run", () => {
    // Two sources of one event (E1), one of another (E2) and one that is in no event.
    const EVENTS = new Map([
      ["https://a.example/1", "E1"],
      ["https://b.example/2", "E1"],
      ["https://c.example/3", "E2"],
    ]);
    const citing = (...urls: string[]) => ({ sources: urls.map(cited) });
    const run = (candidates: NewFinding[], report?: DedupeReport) =>
      dropDuplicates(candidates, [], [], report, EVENTS);

    it("drops a later candidate that cites only sources of an event a kept candidate cites, whatever its words and its category", () => {
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(["xray", "yankee"], {
        category: "legal_regulatory",
        ...citing("https://b.example/2"),
      });

      expect(run([first, second])).toEqual({ kept: [first], dropped: 1 });
    });

    it("keeps a candidate that cites a source in no event besides a source of a taken one", () => {
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(
        ["xray", "yankee"],
        citing("https://b.example/2", "https://elsewhere.example/9"),
      );

      expect(run([first, second]).kept).toEqual([first, second]);
    });

    it("keeps a candidate that cites a source of a new event besides a source of a taken one", () => {
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(
        ["xray", "yankee"],
        citing("https://b.example/2", "https://c.example/3"),
      );

      expect(run([first, second]).kept).toEqual([first, second]);
    });

    it("keeps a candidate of another event", () => {
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(["xray", "yankee"], citing("https://c.example/3"));

      expect(run([first, second]).kept).toEqual([first, second]);
    });

    it("never drops a candidate whose sources are in no event", () => {
      const first = candidate(["alpha", "bravo"], citing("https://elsewhere.example/1"));
      const second = candidate(["xray", "yankee"], citing("https://elsewhere.example/2"));

      expect(run([first, second]).kept).toEqual([first, second]);
    });

    it("counts every event a kept candidate cites as taken", () => {
      const first = candidate(
        ["alpha", "bravo"],
        citing("https://a.example/1", "https://c.example/3"),
      );
      const second = candidate(["xray", "yankee"], citing("https://c.example/3"));
      const third = candidate(["mike", "november"], citing("https://b.example/2"));

      expect(run([first, second, third])).toEqual({ kept: [first], dropped: 2 });
    });

    it("does not count the events of a candidate that was dropped", () => {
      const first = candidate(["alpha", "bravo", "charlie"], citing("https://a.example/1"));
      // Dropped for its words (the same run), though it cites the other event.
      const repeat = candidate(
        ["alpha", "bravo", "charlie", "delta"],
        citing("https://c.example/3"),
      );
      const third = candidate(["xray", "yankee"], citing("https://c.example/3"));

      expect(run([first, repeat, third]).kept).toEqual([first, third]);
    });

    it("reports the candidate as a repeat of an event, and a repeat of the words as one of the run", () => {
      const report: DedupeReport = { reasons: {} };
      const first = candidate(["alpha", "bravo", "charlie"], citing("https://a.example/1"));
      const sameWords = candidate(
        ["alpha", "bravo", "charlie", "delta"],
        citing("https://b.example/2"),
      );
      const sameEvent = candidate(["xray", "yankee"], citing("https://b.example/2"));

      const { dropped } = run([first, sameWords, sameEvent], report);

      expect(dropped).toBe(2);
      expect(report.reasons).toEqual({ same_run: 1, same_event: 1 });
    });

    it("lets the register and the earlier findings decide first", () => {
      const report: DedupeReport = { reasons: {} };
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(["golf", "hotel", "india"], citing("https://b.example/2"));

      dropDuplicates([first, second], [risk(["golf", "hotel", "india"])], [], report, EVENTS);

      expect(report.reasons).toEqual({ active_risk: 1 });
    });

    it("changes nothing when it is given no events", () => {
      const first = candidate(["alpha", "bravo"], citing("https://a.example/1"));
      const second = candidate(["xray", "yankee"], citing("https://b.example/2"));

      expect(dropDuplicates([first, second], [], [])).toEqual({
        kept: [first, second],
        dropped: 0,
      });
      expect(dropDuplicates([first, second], [], [], undefined, new Map()).kept).toEqual([
        first,
        second,
      ]);
    });
  });

  describe("the count of what was dropped", () => {
    it("counts every removal, whatever the reason, and keeps the rest in their order", () => {
      const first = candidate(["alpha", "bravo", "charlie"]);
      const coveredByRegister = candidate(["golf", "hotel"]);
      const coveredByEarlierFinding = candidate(["india", "juliet", "kilo"]);
      const coveredByUrl = candidate(["lima", "mike"], {
        sources: [cited("https://x.example.com/u")],
      });
      const repeatsFirst = candidate(["alpha", "bravo", "charlie", "november"]);
      const second = candidate(["oscar", "papa", "quebec"]);

      const result = dropDuplicates(
        [first, coveredByRegister, coveredByEarlierFinding, coveredByUrl, repeatsFirst, second],
        [risk(["golf", "hotel"])],
        [
          prior(["india", "juliet", "kilo"]),
          prior(["romeo", "sierra"], { sources: [cited("https://x.example.com/u")] }),
        ],
      );

      expect(result.kept.map(descriptionOf)).toEqual([descriptionOf(first), descriptionOf(second)]);
      expect(result.dropped).toBe(4);
    });
  });

  it("does not change what it is given", () => {
    const candidates = [candidate(["alpha", "bravo"]), candidate(["alpha", "bravo", "charlie"])];
    const risks = [risk(["golf", "hotel"])];
    const earlier = [prior(["india", "juliet"])];
    const snapshot = JSON.parse(JSON.stringify({ candidates, risks, earlier }));

    dropDuplicates(candidates, risks, earlier);

    expect({ candidates, risks, earlier }).toEqual(snapshot);
  });

  it("returns the very objects it was given as kept", () => {
    const first = candidate(["alpha", "bravo"]);

    expect(dropDuplicates([first], [], []).kept[0]).toBe(first);
  });
});

describe("dropDuplicates report", () => {
  it("counts the candidates dropped, by what they repeat", () => {
    const report: DedupeReport = { reasons: {} };
    const candidates = [
      candidate(["alpha", "bravo", "charlie"]),
      candidate(["delta", "echo", "foxtrot"], {}, []),
      candidate(["golf", "hotel", "india"], { sources: [cited("https://same.example.org/page")] }),
      candidate(["juliet", "kilo", "lima"]),
      candidate(["juliet", "kilo", "lima", "mike"]),
    ];

    const { dropped } = dropDuplicates(
      candidates,
      [risk(["alpha", "bravo", "charlie"])],
      [
        prior(["delta", "echo", "foxtrot"]),
        prior(["zulu", "yankee"], { sources: [cited("https://same.example.org/page")] }),
      ],
      report,
    );

    expect(dropped).toBe(4);
    expect(report.reasons).toEqual({
      active_risk: 1,
      earlier_finding: 1,
      same_source: 1,
      same_run: 1,
    });
  });

  it("leaves the report empty when nothing is dropped", () => {
    const report: DedupeReport = { reasons: {} };

    dropDuplicates([candidate(["alpha", "bravo"])], [], [], report);

    expect(report.reasons).toEqual({});
  });
});
