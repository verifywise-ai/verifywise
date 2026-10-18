import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import CustomAxios from "../customAxios";
import { aedtBiasAuditService } from "../aedtBiasAuditService";

/** Answers every request with `responseData` and records what was sent. */
const respondWith = (responseData: unknown) => {
  const sent: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config);
    return { data: responseData, status: 200, statusText: "OK", headers: {}, config };
  };
  CustomAxios.defaults.adapter = adapter;
  return sent;
};

describe("aedtBiasAuditService.getRunTrend", () => {
  const defaultAdapter = CustomAxios.defaults.adapter;
  afterEach(() => {
    CustomAxios.defaults.adapter = defaultAdapter;
  });

  it("fails closed: only an explicit false clears a point of the caveat", async () => {
    const point = (runId: number, caveat: unknown) => ({
      runId,
      date: "2026-01-10",
      category: "sex",
      lowestRatio: 0.9,
      flagged: false,
      ...(caveat === undefined ? {} : { caveat }),
    });
    const sent = respondWith({
      message: "OK",
      data: {
        segments: [
          {
            profileVersion: 1,
            questionSetVersion: 1,
            jobDescriptionKey: null,
            metric: "selection_rate",
            points: [point(1, undefined), point(2, "false"), point(3, false), point(4, true)],
          },
        ],
        breaks: [],
      },
    });

    const series = await aedtBiasAuditService.getRunTrend(7, 12);

    expect(series.segments[0].points.map((p) => [p.runId, p.caveat])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, true],
    ]);
    expect(sent[0].url).toBe("/bias-audit/runs/trend");
    expect(sent[0].params).toEqual({ projectId: 7, frameworkId: 12 });
  });
});
