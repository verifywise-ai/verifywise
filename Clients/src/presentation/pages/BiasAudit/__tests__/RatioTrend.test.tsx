import type React from "react";
import type { ReactNode } from "react";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { AedtTrendSeries } from "../../../../infrastructure/api/aedtBiasAuditService";

const repo = vi.hoisted(() => ({ getAedtRunTrend: vi.fn() }));

vi.mock("../../../../application/repository/aedtBiasAudit.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

// jsdom has no layout, so recharts would draw nothing. These stand-ins
// expose what the chart was asked to draw.
vi.mock("recharts", async () => {
  const { cloneElement, isValidElement } = await import("react");
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    LineChart: ({ children, data }: { children: ReactNode; data: unknown[] }) => (
      <div data-testid="line-chart" data-rows={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Line: ({
      dataKey,
      connectNulls,
      activeDot,
    }: {
      dataKey: string;
      connectNulls?: boolean;
      activeDot?: unknown;
    }) => (
      <div data-testid="line" data-key={dataKey} data-connect-nulls={String(connectNulls)}>
        {/* The hovered point, drawn as recharts would for a caveated run. */}
        {isValidElement(activeDot) && (
          <svg data-testid={`active-dot-${dataKey}`}>
            {cloneElement(activeDot as React.ReactElement<Record<string, unknown>>, {
              cx: 1,
              cy: 1,
              payload: { caveat: true, flagged: false },
            })}
          </svg>
        )}
      </div>
    ),
    ReferenceLine: ({ x, y }: { x?: number; y?: number }) => (
      <div data-testid="reference-line" data-x={x ?? ""} data-y={y ?? ""} />
    ),
    CartesianGrid: () => null,
    XAxis: ({
      ticks,
      tickFormatter,
    }: {
      ticks: number[];
      tickFormatter: (x: number) => string;
    }) => <div data-testid="x-ticks">{ticks.map((t) => tickFormatter(t)).join("|")}</div>,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

import RatioTrend, { RatioTrendSection } from "../RatioTrend";
import { palette } from "../../../themes/palette";

const oneSegment: AedtTrendSeries = {
  segments: [
    {
      profileVersion: 1,
      questionSetVersion: 1,
      jobDescriptionKey: "commercial-ae",
      metric: "selection_rate",
      points: [
        {
          runId: 1,
          date: "2026-01-10",
          category: "sex",
          lowestRatio: 0.95,
          flagged: false,
          caveat: false,
        },
        {
          runId: 2,
          date: "2026-04-10",
          category: "sex",
          lowestRatio: 0.88,
          flagged: false,
          caveat: false,
        },
      ],
    },
  ],
  breaks: [],
};

const twoSegments: AedtTrendSeries = {
  segments: [
    { ...oneSegment.segments[0] },
    {
      profileVersion: 2,
      questionSetVersion: 1,
      jobDescriptionKey: "commercial-ae",
      metric: "selection_rate",
      points: [
        {
          runId: 3,
          date: "2026-07-10",
          category: "sex",
          lowestRatio: 0.72,
          flagged: true,
          caveat: false,
        },
      ],
    },
  ],
  breaks: [{ afterRunId: 2, reasons: ["the AEDT profile was changed"] }],
};

const render = (series: AedtTrendSeries) => renderWithProviders(<RatioTrend series={series} />);

describe("RatioTrend", () => {
  it("renders a point per run", () => {
    render(oneSegment);
    expect(screen.getByText(/0\.95/)).toBeInTheDocument();
    expect(screen.getByText(/0\.88/)).toBeInTheDocument();
  });

  it("shows the break and what changed", () => {
    render(twoSegments);
    expect(screen.getByText(/the AEDT profile was changed/i)).toBeInTheDocument();
  });

  it("says why the series is not joined across the break", () => {
    render(twoSegments);
    expect(screen.getByText(/not comparable|cannot be compared/i)).toBeInTheDocument();
  });

  it("states that 0.80 is a convention wherever it marks the axis", () => {
    render(oneSegment);
    expect(screen.getByText(/0\.80/)).toBeInTheDocument();
    expect(screen.getByText(/convention|four-fifths/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.80/)).toHaveTextContent(/does not adopt/i);
  });

  it("renders an empty state for a single run rather than a one-point chart", () => {
    const single = {
      segments: [{ ...oneSegment.segments[0], points: [oneSegment.segments[0].points[0]] }],
      breaks: [],
    };
    render(single);
    expect(screen.getByText(/not enough runs/i)).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("uses no forbidden vocabulary", () => {
    render(twoSegments);
    const text = document.body.textContent!.toLowerCase();
    // Mirrors FORBIDDEN_WORDS in Servers/services/biasAudit/stance/vocabulary.ts.
    for (const w of ["compliant", "certified", "passed", "bias-free", "audited"]) {
      expect(text).not.toContain(w);
    }
  });
});

describe("RatioTrend never draws a line across a break", () => {
  it("draws one line per segment, none joining over gaps", () => {
    render(twoSegments);
    const lines = screen.getAllByTestId("line");
    expect(lines.map((l) => l.getAttribute("data-key"))).toEqual(["s0", "s1"]);
    for (const l of lines) expect(l).toHaveAttribute("data-connect-nulls", "false");
  });

  it("gives each run a value on its own segment's line only", () => {
    render(twoSegments);
    const rows = JSON.parse(screen.getByTestId("line-chart").getAttribute("data-rows")!) as Array<
      Record<string, unknown>
    >;
    expect(rows.map((r) => [r.runId, r.s0, r.s1])).toEqual([
      [1, 0.95, undefined],
      [2, 0.88, undefined],
      [3, undefined, 0.72],
    ]);
  });

  it("marks the break between the last run before it and the first after, and the 0.80 line", () => {
    render(twoSegments);
    const refs = screen.getAllByTestId("reference-line");
    // Runs sit at x = 0, 1, 2; the break after run 2 (x = 1) sits at 1.5, on no run's dot.
    expect(refs.map((r) => [r.getAttribute("data-x"), r.getAttribute("data-y")])).toEqual([
      ["", "0.8"],
      ["1.5", ""],
    ]);
    const rows = JSON.parse(screen.getByTestId("line-chart").getAttribute("data-rows")!) as Array<
      Record<string, unknown>
    >;
    expect(rows.map((r) => r.x)).toEqual([0, 1, 2]);
  });

  it("lists every reason of a break and numbers it", () => {
    render({
      ...twoSegments,
      breaks: [
        {
          afterRunId: 2,
          reasons: ["the AEDT profile was changed", "a different job description was tested"],
        },
      ],
    });
    const notice = screen.getByTestId("aedt-trend-break-2");
    expect(within(notice).getByText("Break")).toBeInTheDocument();
    expect(within(notice).getAllByRole("listitem")).toHaveLength(2);
  });

  it("puts each segment's configuration above its runs", () => {
    render(twoSegments);
    const second = screen.getByTestId("aedt-trend-segment-1");
    expect(second).toHaveTextContent("Profile version 2");
    expect(within(second).getByTestId("aedt-trend-point-3")).toHaveTextContent("Below 0.80");
  });

  it("shows a run with no ratio as a dash and says why, without counting it as plotted", () => {
    const withNull: AedtTrendSeries = {
      segments: [
        {
          ...oneSegment.segments[0],
          points: [
            oneSegment.segments[0].points[0],
            {
              runId: 2,
              date: "2026-04-10",
              category: null,
              lowestRatio: null,
              flagged: false,
              caveat: false,
            },
            {
              runId: 4,
              date: "2026-05-10",
              category: "sex",
              lowestRatio: 0.9,
              flagged: false,
              caveat: false,
            },
          ],
        },
      ],
      breaks: [],
    };
    render(withNull);
    expect(screen.getByTestId("aedt-trend-point-2")).toHaveTextContent(
      "No impact ratio was computed for this run.",
    );

    renderWithProviders(
      <RatioTrend
        series={{
          segments: [{ ...withNull.segments[0], points: withNull.segments[0].points.slice(0, 2) }],
          breaks: [],
        }}
      />,
    );
    expect(screen.getByTestId("aedt-trend-empty")).toBeInTheDocument();
  });

  it("shows the empty state when there are no runs", () => {
    render({ segments: [], breaks: [] });
    expect(screen.getByText(/not enough runs/i)).toBeInTheDocument();
  });
});

describe("RatioTrendSection", () => {
  beforeEach(() => {
    repo.getAedtRunTrend.mockReset();
  });

  it("shows a spinner while the trend loads", async () => {
    repo.getAedtRunTrend.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RatioTrendSection projectId={7} />);
    expect(await screen.findByTestId("aedt-ratio-trend-loading")).toBeInTheDocument();
    expect(repo.getAedtRunTrend).toHaveBeenCalledWith(7);
  });

  it("shows the server's message when the trend is refused", async () => {
    repo.getAedtRunTrend.mockRejectedValue(
      new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 404,
        statusText: "404",
        data: { data: "Project 7 was not found" },
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    renderWithProviders(<RatioTrendSection projectId={7} />);
    expect(await screen.findByTestId("aedt-ratio-trend-error")).toHaveTextContent(
      "Project 7 was not found",
    );
  });

  it("renders the series it loaded", async () => {
    repo.getAedtRunTrend.mockResolvedValue(twoSegments);
    renderWithProviders(<RatioTrendSection projectId={7} />);
    expect(await screen.findByTestId("aedt-ratio-trend")).toBeInTheDocument();
    expect(screen.getByText(/the AEDT profile was changed/i)).toBeInTheDocument();
  });
});

describe("RatioTrend review fixes", () => {
  const segment = oneSegment.segments[0];

  it("never prints a flagged ratio as 0.80 or above", () => {
    render({
      segments: [
        {
          ...segment,
          points: [
            segment.points[0],
            {
              runId: 2,
              date: "2026-04-10",
              category: "sex",
              lowestRatio: 0.7996,
              flagged: true,
              caveat: false,
            },
          ],
        },
      ],
      breaks: [],
    });
    const row = screen.getByTestId("aedt-trend-point-2");
    expect(row).toHaveTextContent("0.799");
    expect(row).not.toHaveTextContent("0.800");
    expect(row).toHaveTextContent("Below 0.80");
  });

  it("tells two runs on one day apart, in the table and on the axis", () => {
    render({
      segments: [
        {
          ...segment,
          points: [
            { ...segment.points[0], runId: 1, date: "2026-04-10T09:15:00.000Z" },
            { ...segment.points[1], runId: 2, date: "2026-04-10T16:45:00.000Z" },
          ],
        },
      ],
      breaks: [],
    });
    const cell = (id: number) => screen.getByTestId(`aedt-trend-point-${id}`).firstElementChild!;
    expect(cell(1).textContent).not.toEqual(cell(2).textContent);
    expect(cell(1).textContent).toMatch(/\d{1,2}:\d{2}/);
    const ticks = screen.getByTestId("x-ticks").textContent!.split("|");
    expect(ticks).toHaveLength(2);
    expect(new Set(ticks).size).toBe(2);
    expect(ticks[0]).toContain("#1");
  });

  it("marks a run the data checks did not clear, in the table and beneath the chart", () => {
    render({
      segments: [
        {
          ...segment,
          points: [segment.points[0], { ...segment.points[1], caveat: true }],
        },
      ],
      breaks: [],
    });
    expect(screen.getByTestId("aedt-trend-point-2")).toHaveTextContent(
      "The data checks did not clear this run for export, so its ratio is shown with that caveat.",
    );
    expect(screen.getByTestId("aedt-trend-point-1")).not.toHaveTextContent("data checks");
    expect(screen.getByTestId("aedt-trend-caveat")).toHaveTextContent(/hollow point/);
  });

  it("says nothing about the data checks when every run was cleared", () => {
    render(oneSegment);
    expect(screen.queryByTestId("aedt-trend-caveat")).not.toBeInTheDocument();
  });

  it("shows the job description as the stance document does", () => {
    render(oneSegment);
    expect(screen.getByTestId("aedt-trend-segment-0")).toHaveTextContent(
      "Job description commercial ae",
    );
  });
});

describe("RatioTrend caveat edges", () => {
  const segment = oneSegment.segments[0];
  const nullCaveated = {
    runId: 5,
    date: "2026-06-10",
    category: null,
    lowestRatio: null,
    flagged: false,
    caveat: true,
  };

  it("does not claim a ratio is shown for a caveated run with no ratio", () => {
    render({
      segments: [{ ...segment, points: [...segment.points, nullCaveated] }],
      breaks: [],
    });
    const row = screen.getByTestId("aedt-trend-point-5");
    expect(row).toHaveTextContent("No impact ratio was computed for this run.");
    expect(row).not.toHaveTextContent("shown with that caveat");
  });

  it("explains hollow points only when one is drawn", () => {
    render({
      segments: [{ ...segment, points: [...segment.points, nullCaveated] }],
      breaks: [],
    });
    expect(screen.queryByTestId("aedt-trend-caveat")).not.toBeInTheDocument();
  });

  it("keeps a caveated point hollow when it is hovered", () => {
    render(oneSegment);
    const circle = screen.getByTestId("active-dot-s0").querySelector("circle")!;
    expect(circle).toHaveAttribute("fill", palette.background.main);
    expect(circle).toHaveAttribute("r", "5");
  });
});
