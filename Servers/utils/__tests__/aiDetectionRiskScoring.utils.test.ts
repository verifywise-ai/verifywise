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
  it("stays off until an admin chooses, even with an LLM key (code is never sent implicitly)", () => {
    expect(resolveVulnerabilityScanEnabled(null, true, 4)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(undefined, true, 4)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(null, null, null)).toBe(false);
  });

  it("runs only when explicitly on and LLM analysis has a key", () => {
    expect(resolveVulnerabilityScanEnabled(true, true, 4)).toBe(true);
    expect(resolveVulnerabilityScanEnabled(false, true, 4)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(true, true, null)).toBe(false);
    expect(resolveVulnerabilityScanEnabled(true, false, 4)).toBe(false);
  });
});

describe("getRiskScoringConfigQuery", () => {
  beforeEach(() => mockQuery.mockReset());

  it("reports an unchosen setting as off and not explicit", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1, llm_enabled: true, llm_key_id: 4, dimension_weights: {} }])
      .mockResolvedValueOnce([]);

    const config = await getRiskScoringConfigQuery(9);

    expect(config!.vulnerability_scan_enabled).toBe(false);
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
