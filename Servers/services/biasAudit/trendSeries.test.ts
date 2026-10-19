import { buildTrendSeries, metricChangeReason, type TrendRun } from "./trendSeries";

const run = (
  id: number,
  date: string,
  profileVersion: number,
  lowest: number,
  opts: Partial<{
    questionSetVersion: number;
    jobDescriptionKey: string | null;
    metric: string;
  }> = {},
): TrendRun => ({
  id,
  created_at: date,
  profile_version: profileVersion,
  question_set_version: opts.questionSetVersion ?? 1,
  job_description_key:
    opts.jobDescriptionKey === undefined ? "commercial-ae" : opts.jobDescriptionKey,
  metric: opts.metric ?? "selection_rate",
  result_metric: opts.metric ?? "selection_rate",
  gate_findings_json: [],
  tables: [
    {
      categoryKey: "sex",
      rows: [
        { categoryName: "Male", impactRatio: 1, flagged: false },
        { categoryName: "Female", impactRatio: lowest, flagged: lowest < 0.8 },
      ],
    },
  ],
});

describe("one unbroken series", () => {
  const series = buildTrendSeries([
    run(1, "2026-01-10", 1, 0.95),
    run(2, "2026-04-10", 1, 0.91),
    run(3, "2026-07-10", 1, 0.88),
  ]);

  it("returns a single segment when nothing changed", () => {
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1, 2, 3]);
    expect(series.breaks).toEqual([]);
  });

  it("carries the lowest ratio per run", () => {
    expect(series.segments[0].points.map((p) => p.lowestRatio)).toEqual([0.95, 0.91, 0.88]);
  });

  it("orders points oldest first", () => {
    const dates = series.segments[0].points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("a break is drawn rather than a line", () => {
  it("segments on a profile version change and names it", () => {
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95), run(2, "2026-04-10", 2, 0.72)]);
    expect(series.segments).toHaveLength(2);
    expect(series.breaks).toHaveLength(1);
    expect(series.breaks[0].afterRunId).toBe(1);
    expect(series.breaks[0].reasons).toContain("the AEDT profile was changed");
  });

  it("segments on a job description change and names it", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { jobDescriptionKey: "operational-hourly" }),
    ]);
    expect(series.segments).toHaveLength(2);
    expect(series.breaks[0].reasons).toContain("a different job description was tested");
  });

  it("does not segment on a job description that differs only in case", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95, { jobDescriptionKey: "Account executive" }),
      run(2, "2026-04-10", 1, 0.93, { jobDescriptionKey: "account Executive" }),
    ]);
    expect(series.segments).toHaveLength(1);
    expect(series.breaks).toEqual([]);
  });

  it("segments on a question set change", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { questionSetVersion: 2 }),
    ]);
    expect(series.breaks[0].reasons).toContain("the question set was revised");
  });

  it("segments on a metric change", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { metric: "scoring_rate" }),
    ]);
    expect(series.breaks[0].reasons).toContain(
      "the measure changed between a selection rate and a scoring rate",
    );
  });

  it("names every simultaneous reason on one break", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 2, 0.93, {
        jobDescriptionKey: "operational-hourly",
        metric: "scoring_rate",
      }),
    ]);
    expect(series.breaks[0].reasons).toHaveLength(3);
  });
});

describe("runs that cannot contribute a point", () => {
  it("skips a run with no result, without breaking the series", () => {
    const blocked = { ...run(2, "2026-04-10", 1, 0.9), tables: null, result_metric: null };
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      blocked,
      run(3, "2026-07-10", 1, 0.9),
    ]);
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1, 3]);
  });

  it("carries a null ratio where every ratio in a table was null", () => {
    const degenerate = {
      ...run(2, "2026-04-10", 1, 0.9),
      tables: [
        {
          categoryKey: "sex",
          rows: [
            { categoryName: "Male", impactRatio: null, flagged: false },
            { categoryName: "Female", impactRatio: null, flagged: false },
          ],
        },
      ],
    };
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95), degenerate]);
    const pts = series.segments[0].points;
    expect(pts[1].lowestRatio).toBeNull();
  });

  it("returns an empty series for no runs", () => {
    expect(buildTrendSeries([])).toEqual({ segments: [], breaks: [] });
  });

  it("returns one segment and no break for a single run", () => {
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95)]);
    expect(series.segments).toHaveLength(1);
    expect(series.breaks).toEqual([]);
  });
});

describe("excluded groups never become the lowest point", () => {
  it("ignores a row excluded under 5-301(d)", () => {
    const withExcluded = {
      ...run(1, "2026-01-10", 1, 0.95),
      tables: [
        {
          categoryKey: "sex",
          rows: [
            { categoryName: "Male", impactRatio: 1, flagged: false },
            { categoryName: "Female", impactRatio: 0.95, flagged: false },
            { categoryName: "Unknown", impactRatio: null, flagged: false, excluded: true },
          ],
        },
      ],
    };
    const series = buildTrendSeries([withExcluded]);
    expect(series.segments[0].points[0].lowestRatio).toBe(0.95);
  });

  it("ignores an excluded row even when it carries a lower ratio and a flag", () => {
    const withExcluded = {
      ...run(1, "2026-01-10", 1, 0.95),
      tables: [
        {
          categoryKey: "sex",
          rows: [
            { categoryName: "Male", impactRatio: 1, flagged: false },
            { categoryName: "Female", impactRatio: 0.95, flagged: false },
            { categoryName: "Other", impactRatio: 0.2, flagged: true, excluded: true },
          ],
        },
      ],
    };
    const point = buildTrendSeries([withExcluded]).segments[0].points[0];
    expect(point.lowestRatio).toBe(0.95);
    expect(point.flagged).toBe(false);
  });
});

describe("fairness_metrics runs draw no ratio", () => {
  // The engine leaves `tables` empty in this mode: its per-group figures are
  // confusion-matrix rates (`fairnessMetricsTables`), not impact ratios.
  const fairness = (id: number, date: string): TrendRun => ({
    ...run(id, date, 1, 0.5),
    metric: "fairness_metrics",
    result_metric: "fairness_metrics",
    tables: [],
  });

  it("contributes no point", () => {
    const series = buildTrendSeries([fairness(1, "2026-01-10")]);
    expect(series).toEqual({ segments: [], breaks: [] });
  });

  it("neither opens nor closes a segment between two comparable runs", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      fairness(2, "2026-02-10"),
      run(3, "2026-03-10", 1, 0.9),
    ]);
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1, 3]);
    expect(series.breaks).toEqual([]);
  });

  it("is skipped on its result's metric even if the row's metric disagrees", () => {
    const odd = { ...fairness(2, "2026-02-10"), metric: "selection_rate" };
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95), odd]);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1]);
  });
});

describe("a run its data checks did not clear for export", () => {
  it("carries the caveat on a warning, a stop, or no findings record", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      { ...run(2, "2026-02-10", 1, 0.9), gate_findings_json: [{ severity: "note" }] },
      { ...run(3, "2026-03-10", 1, 0.9), gate_findings_json: [{ severity: "warn" }] },
      { ...run(4, "2026-04-10", 1, 0.9), gate_findings_json: [{ severity: "stop" }] },
      { ...run(5, "2026-05-10", 1, 0.9), gate_findings_json: null },
    ]);
    expect(series.segments[0].points.map((p) => [p.runId, p.caveat])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true],
      [5, true],
    ]);
  });

  it("still plots the ratio, in the same segment", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      { ...run(2, "2026-02-10", 1, 0.9), gate_findings_json: [{ severity: "warn" }] },
    ]);
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points[1]).toMatchObject({ lowestRatio: 0.9, caveat: true });
  });
});

describe("the metric reason names the actual change", () => {
  it("reads the same either way round", () => {
    expect(metricChangeReason("scoring_rate", "selection_rate")).toBe(
      "the measure changed between a selection rate and a scoring rate",
    );
  });

  it("names fairness metrics in plain words", () => {
    expect(metricChangeReason("fairness_metrics", "selection_rate")).toBe(
      "the measure changed between a selection rate and fairness metrics",
    );
  });

  it("quotes a measure it does not know rather than mislabelling it", () => {
    expect(metricChangeReason("selection_rate", "new_rate")).toBe(
      'the measure changed between a selection rate and the measure "new_rate"',
    );
  });
});

describe("category and flag of a point", () => {
  const twoTables = (femaleRatio: number, blackRatio: number, blackFlagged: boolean): TrendRun => ({
    ...run(1, "2026-01-10", 1, 0.95),
    tables: [
      {
        categoryKey: "sex",
        rows: [
          { categoryName: "Male", impactRatio: 1, flagged: false },
          { categoryName: "Female", impactRatio: femaleRatio, flagged: false },
        ],
      },
      {
        categoryKey: "race_ethnicity",
        rows: [
          { categoryName: "White", impactRatio: 1, flagged: false },
          { categoryName: "Black", impactRatio: blackRatio, flagged: blackFlagged },
        ],
      },
    ],
  });

  it("names the table that holds the lowest ratio", () => {
    const point = buildTrendSeries([twoTables(0.95, 0.7, true)]).segments[0].points[0];
    expect(point.category).toBe("race_ethnicity");
    expect(point.lowestRatio).toBe(0.7);
    expect(point.flagged).toBe(true);
  });

  it("keeps the first table on a tie", () => {
    const point = buildTrendSeries([twoTables(0.9, 0.9, false)]).segments[0].points[0];
    expect(point.category).toBe("sex");
  });

  it("is flagged when any non-excluded group is flagged, not only the lowest", () => {
    // Under one threshold the lowest row is flagged whenever any row is; the
    // rule is stated on its own so it does not hang on that coincidence.
    const point = buildTrendSeries([twoTables(0.6, 0.7, true)]).segments[0].points[0];
    expect(point.category).toBe("sex");
    expect(point.flagged).toBe(true);
  });

  it("has a null category when the run produced no ratio", () => {
    const empty = { ...run(1, "2026-01-10", 1, 0.95), tables: [] };
    const point = buildTrendSeries([empty]).segments[0].points[0];
    expect(point).toMatchObject({ category: null, lowestRatio: null, flagged: false });
  });
});

describe("dates and ordering", () => {
  it("writes a Date as ISO 8601", () => {
    const series = buildTrendSeries([
      { ...run(1, "x", 1, 0.95), created_at: new Date("2026-01-10T12:00:00Z") },
    ]);
    expect(series.segments[0].points[0].date).toBe("2026-01-10T12:00:00.000Z");
  });

  it("keeps the order it is given, which the query sets (created_at, then id)", () => {
    // Runs recorded within one millisecond keep the database's microsecond
    // order: buildTrendSeries does not re-sort them.
    const series = buildTrendSeries([
      run(2, "2026-01-10T10:00:00.000Z", 1, 0.91),
      run(1, "2026-01-10T10:00:00.000Z", 1, 0.95),
      run(3, "not a date", 1, 0.88),
    ]);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([2, 1, 3]);
  });

  it("treats a missing job description the same as null", () => {
    // The row type says string | null; a row read without the column must not
    // read as a change, in either position.
    const omitted = (id: number, date: string): TrendRun => {
      const r = run(id, date, 1, 0.9, { jobDescriptionKey: null }) as Partial<TrendRun>;
      delete r.job_description_key;
      return r as TrendRun;
    };
    const series = buildTrendSeries([
      omitted(1, "2026-01-10"),
      run(2, "2026-04-10", 1, 0.9, { jobDescriptionKey: null }),
      omitted(3, "2026-07-10"),
    ]);
    expect(series.breaks).toEqual([]);
    expect(series.segments[0].jobDescriptionKey).toBeNull();
  });
});

describe("the data source", () => {
  const corpusRun = (
    id: number,
    date: string,
    corpusId: number,
    sha: string,
    model = "m1",
    kind = "resume",
  ): TrendRun => ({
    ...run(id, date, 1, 0.9),
    corpus_id: corpusId,
    corpus_job_description_sha256: sha,
    corpus_model_pinned: model,
    corpus_artifact_kind: kind,
  });

  it("breaks between uploaded and generated data with the same job description", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      corpusRun(2, "2026-04-10", 3, "a".repeat(64)),
    ]);
    expect(series.segments).toHaveLength(2);
    expect(series.breaks[0].reasons).toEqual([
      "the data source changed between uploaded and generated data",
    ]);
    expect(series.segments[1]).toMatchObject({
      corpusId: 3,
      corpusJobDescriptionSha256: "a".repeat(64),
    });
    expect(series.segments[0]).toMatchObject({ corpusId: null, corpusJobDescriptionSha256: null });
  });

  it("joins corpus runs whose corpora share the fixed job description text", () => {
    const series = buildTrendSeries([
      corpusRun(1, "2026-01-10", 3, "a".repeat(64)),
      corpusRun(2, "2026-04-10", 4, "a".repeat(64)),
    ]);
    expect(series.segments).toHaveLength(1);
    expect(series.breaks).toEqual([]);
  });

  it("breaks where the generating model or the record form differs between corpora", () => {
    const series = buildTrendSeries([
      corpusRun(1, "2026-01-10", 3, "a".repeat(64), "m1", "resume"),
      corpusRun(2, "2026-04-10", 4, "a".repeat(64), "m2", "resume"),
      corpusRun(3, "2026-07-10", 5, "a".repeat(64), "m2", "transcript"),
    ]);
    expect(series.breaks.map((b) => b.reasons)).toEqual([
      ["the model that generated the corpus changed"],
      ["the form of the generated records changed"],
    ]);
  });

  it("breaks where the fixed job description text differs between corpora", () => {
    const series = buildTrendSeries([
      corpusRun(1, "2026-01-10", 3, "a".repeat(64)),
      corpusRun(2, "2026-04-10", 4, "b".repeat(64)),
    ]);
    expect(series.breaks[0].reasons).toEqual([
      "the fixed job description text changed between corpora",
    ]);
  });
});
