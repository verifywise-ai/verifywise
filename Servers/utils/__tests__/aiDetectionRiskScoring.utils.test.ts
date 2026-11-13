/**
 * @fileoverview Effective default for AI Detection vulnerability detection.
 *
 * @module tests/aiDetectionRiskScoring.utils
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  getRiskScoringConfigQuery,
  resolveVulnerabilityScanEnabled,
} from "../aiDetectionRiskScoring.utils";

const mockQuery = sequelize.query as unknown as jest.Mock;

describe("resolveVulnerabilityScanEnabled", () => {
  it("is on by default when LLM analysis has a key", () => {
    expect(resolveVulnerabilityScanEnabled(null, true, 4)).toBe(true);
    expect(resolveVulnerabilityScanEnabled(undefined, true, 4)).toBe(true);
  });

  it("is off by default without a key or with LLM analysis off", () => {
    expect(resolveVulnerabilityScanEnabled(null, true, null)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(null, false, 4)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(null, null, null)).toBe(false);
  });

  it("lets an explicit choice win", () => {
    expect(resolveVulnerabilityScanEnabled(false, true, 4)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(true, true, 4)).toBe(true);
  });
});

describe("getRiskScoringConfigQuery", () => {
  beforeEach(() => mockQuery.mockReset());

  it("reports the default as not explicit when the org never chose", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1, llm_enabled: true, llm_key_id: 4, dimension_weights: {} }])
      .mockResolvedValueOnce([]);

    const config = await getRiskScoringConfigQuery(9);

    expect(config!.vulnerability_scan_enabled).toBe(true);
    expect(config!.vulnerability_scan_explicit).toBe(false);
  });

  it("keeps a stored choice", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1, llm_enabled: true, llm_key_id: 4, dimension_weights: {} }])
      .mockResolvedValueOnce([
        {
          id: 2,
          organization_id: 9,
          vulnerability_scan_enabled: false,
          vulnerability_types_enabled: null,
        },
      ]);

    const config = await getRiskScoringConfigQuery(9);

    expect(config!.vulnerability_scan_enabled).toBe(false);
    expect(config!.vulnerability_scan_explicit).toBe(true);
  });

  it("scopes both queries to the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, llm_enabled: false, llm_key_id: null }]);
    mockQuery.mockResolvedValueOnce([]);

    await getRiskScoringConfigQuery(9);

    for (const call of mockQuery.mock.calls) {
      expect(call[0]).toContain("organization_id = :organizationId");
      expect(call[1].replacements.organizationId).toBe(9);
    }
  });
});
