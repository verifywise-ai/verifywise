/**
 * @fileoverview Effective default for AI Detection vulnerability detection.
 *
 * @module tests/aiDetectionRiskScoring.utils
 */

const mockTransaction = { id: "tx" };

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn((callback: (t: unknown) => unknown) => callback(mockTransaction)),
  },
}));

import { sequelize } from "../../database/db";
import {
  getRiskScoringConfigQuery,
  resolveVulnerabilityScanEnabled,
  shouldResetVulnerabilityConsent,
  upsertRiskScoringConfigQuery,
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

describe("shouldResetVulnerabilityConsent", () => {
  const existing = { llm_enabled: true, llm_key_id: 4 };

  it("resets when the LLM key changes", () => {
    expect(shouldResetVulnerabilityConsent(existing, { llm_enabled: true, llm_key_id: 5 })).toBe(
      true,
    );
  });

  it("resets when the LLM key is cleared", () => {
    expect(
      shouldResetVulnerabilityConsent(existing, { llm_enabled: false, llm_key_id: null }),
    ).toBe(true);
  });

  it("resets when LLM analysis is turned back on", () => {
    expect(
      shouldResetVulnerabilityConsent(
        { llm_enabled: false, llm_key_id: 4 },
        { llm_enabled: true, llm_key_id: 4 },
      ),
    ).toBe(true);
    expect(shouldResetVulnerabilityConsent(null, { llm_enabled: true, llm_key_id: 4 })).toBe(true);
  });

  it("lets an explicit choice in the same save win", () => {
    expect(
      shouldResetVulnerabilityConsent(existing, {
        llm_enabled: true,
        llm_key_id: 5,
        vulnerability_scan_enabled: true,
      }),
    ).toBe(false);
  });

  it("keeps consent when the key and LLM setting are unchanged", () => {
    expect(shouldResetVulnerabilityConsent(existing, { llm_enabled: true, llm_key_id: 4 })).toBe(
      false,
    );
    // The DB can hand the key back as a string
    expect(
      shouldResetVulnerabilityConsent(
        { llm_enabled: true, llm_key_id: "4" },
        { llm_enabled: true, llm_key_id: 4 },
      ),
    ).toBe(false);
    expect(shouldResetVulnerabilityConsent(existing, {})).toBe(false);
  });
});

describe("upsertRiskScoringConfigQuery", () => {
  const baseRow = {
    id: 1,
    organization_id: 9,
    llm_enabled: true,
    llm_key_id: 4,
    dimension_weights: {},
  };

  function resetCalls() {
    return mockQuery.mock.calls.filter((call) =>
      String(call[0]).includes("SET vulnerability_scan_enabled = NULL"),
    );
  }

  beforeEach(() => {
    mockQuery.mockReset();
    (sequelize.transaction as unknown as jest.Mock).mockClear();
  });

  it("resets stored consent in the same transaction when the key changes", async () => {
    mockQuery
      .mockResolvedValueOnce([baseRow]) // existing (locked)
      .mockResolvedValueOnce([{ ...baseRow, llm_key_id: 5 }]) // update
      .mockResolvedValueOnce(undefined) // consent reset
      .mockResolvedValueOnce([]); // vulnerability config read

    const config = await upsertRiskScoringConfigQuery(9, {
      llm_enabled: true,
      llm_key_id: 5,
      updated_by: 3,
    });

    expect(resetCalls()).toHaveLength(1);
    const [sql, options] = resetCalls()[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(options.replacements.organizationId).toBe(9);
    for (const call of mockQuery.mock.calls) {
      expect(call[1].transaction).toBe(mockTransaction);
    }
    expect(mockQuery.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(config.vulnerability_scan_enabled).toBe(false);
    expect(config.vulnerability_scan_explicit).toBe(false);
  });

  it("stores an explicit choice made in the same save instead of resetting it", async () => {
    mockQuery
      .mockResolvedValueOnce([baseRow])
      .mockResolvedValueOnce([{ ...baseRow, llm_key_id: 5 }])
      .mockResolvedValueOnce(undefined) // vulnerability config upsert
      .mockResolvedValueOnce([
        {
          id: 2,
          organization_id: 9,
          vulnerability_scan_enabled: true,
          vulnerability_types_enabled: null,
        },
      ]);

    const config = await upsertRiskScoringConfigQuery(9, {
      llm_enabled: true,
      llm_key_id: 5,
      vulnerability_scan_enabled: true,
      updated_by: 3,
    });

    expect(resetCalls()).toHaveLength(0);
    expect(config.vulnerability_scan_enabled).toBe(true);
  });

  it("keeps stored consent when the key is unchanged", async () => {
    mockQuery
      .mockResolvedValueOnce([baseRow])
      .mockResolvedValueOnce([baseRow])
      .mockResolvedValueOnce([
        {
          id: 2,
          organization_id: 9,
          vulnerability_scan_enabled: true,
          vulnerability_types_enabled: null,
        },
      ]);

    const config = await upsertRiskScoringConfigQuery(9, {
      llm_enabled: true,
      llm_key_id: 4,
      updated_by: 3,
    });

    expect(resetCalls()).toHaveLength(0);
    expect(config.vulnerability_scan_enabled).toBe(true);
  });

  it("resets stored consent when LLM analysis is turned back on", async () => {
    mockQuery
      .mockResolvedValueOnce([{ ...baseRow, llm_enabled: false }])
      .mockResolvedValueOnce([baseRow])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await upsertRiskScoringConfigQuery(9, { llm_enabled: true, llm_key_id: 4, updated_by: 3 });

    expect(resetCalls()).toHaveLength(1);
  });
});
