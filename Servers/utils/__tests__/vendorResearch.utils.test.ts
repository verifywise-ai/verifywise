/**
 * The finding queries of the vendor research agent (M3, Part B1): a run no longer writes a
 * confidence, and every statement that returns findings reads the label of a finding that has only
 * a confidence (a run before the credibility rule) as that level, on the basis
 * `{ "rule": "legacy_confidence" }`. The statements are checked as text here, with the database
 * mocked; tests/integration/vendorResearch.credibility.test.ts runs them on a real one.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import type { Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import type { NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import {
  getFindingByIdQuery,
  getFindingsForVendorQuery,
  insertFindingsQuery,
  listFindingsQuery,
  markFindingAcceptedQuery,
  markFindingDismissedQuery,
} from "../vendorResearch.utils";

const query = sequelize.query as unknown as jest.Mock;
const TRANSACTION = { LOCK: {} } as unknown as Transaction;

/** The statement a query sent, whitespace folded, and the options it sent with it. */
function sent(call = 0): { sql: string; options: Record<string, unknown> } {
  const [sql, options] = query.mock.calls[call] as [string, Record<string, unknown>];
  return { sql: sql.replace(/\s+/g, " ").trim(), options };
}

const LABEL = "COALESCE(credibility, confidence) AS credibility";
const BASIS =
  `CASE WHEN credibility IS NULL AND confidence IS NOT NULL ` +
  `THEN '{"rule":"legacy_confidence"}'::jsonb ELSE credibility_basis END AS credibility_basis`;
const LABEL_OF_F = "COALESCE(f.credibility, f.confidence) AS credibility";
const BASIS_OF_F =
  `CASE WHEN f.credibility IS NULL AND f.confidence IS NOT NULL ` +
  `THEN '{"rule":"legacy_confidence"}'::jsonb ELSE f.credibility_basis END AS credibility_basis`;

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "A flaw of the vendor's gateway is exploited in the wild.",
  impact_description: "An attacker could reach the data we keep with the vendor.",
  action_plan: "Ask the vendor whether the update is applied.",
  likelihood: "Likely",
  risk_severity: "Major",
  risk_level: "High Risk",
  rationale: null,
  sources: [
    {
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1",
      title: "t",
      quote: "q",
      published_at: null,
    },
  ],
  credibility: "high",
  credibility_basis: {
    rule: "official_record",
    registry_version: "sr-5",
    name_only: false,
    sources: [],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([]);
});

describe("insertFindingsQuery", () => {
  const insert = async (finding: NewFinding = FINDING) => {
    query.mockResolvedValue([{ id: 1 }]);
    await insertFindingsQuery(
      { organizationId: 3, vendorId: 4, runId: 5, findings: [finding] },
      TRANSACTION,
    );
    return sent();
  };

  it("writes no confidence: the column list, the values and the replacements leave it out", async () => {
    const { sql, options } = await insert();

    const written = sql.slice(0, sql.indexOf("RETURNING"));
    expect(written).toContain("INSERT INTO vendor_risk_findings");
    expect(written).not.toMatch(/confidence/i);
    expect(options.replacements).not.toHaveProperty("confidence");
  });

  it("writes the label and its basis, and still reads the row back whole", async () => {
    const { sql, options } = await insert();

    expect(sql).toContain("credibility, credibility_basis");
    expect(options.replacements).toMatchObject({
      credibility: "high",
      credibilityBasis: JSON.stringify(FINDING.credibility_basis),
    });
    // The row that comes back has the columns every finding query has, the confidence too.
    expect(sql.slice(sql.indexOf("RETURNING"))).toContain("confidence");
  });

  it("does not write a confidence a caller built by hand and passed along", async () => {
    const withOne = { ...FINDING, confidence: "high" } as unknown as NewFinding;

    const { sql, options } = await insert(withOne);

    expect(sql.slice(0, sql.indexOf("RETURNING"))).not.toMatch(/confidence/i);
    expect(options.replacements).not.toHaveProperty("confidence");
  });
});

describe("the queries that return findings", () => {
  it.each([
    [
      "insertFindingsQuery",
      () =>
        insertFindingsQuery(
          { organizationId: 3, vendorId: 4, runId: 5, findings: [FINDING] },
          TRANSACTION,
        ),
    ],
    ["getFindingByIdQuery", () => getFindingByIdQuery(3, 9)],
    ["getFindingsForVendorQuery", () => getFindingsForVendorQuery(3, 4)],
    [
      "markFindingAcceptedQuery",
      () =>
        markFindingAcceptedQuery(
          { organizationId: 3, id: 9, vendorRiskId: 2, userId: 1 },
          TRANSACTION,
        ),
    ],
    [
      "markFindingDismissedQuery",
      () =>
        markFindingDismissedQuery(
          { organizationId: 3, id: 9, reason: "other", note: null, userId: 1 },
          TRANSACTION,
        ),
    ],
  ])("%s reads the label and the basis with the legacy fallback", async (_name, run) => {
    query.mockResolvedValue([{ id: 1 }]);

    await run();

    const { sql } = sent();
    expect(sql).toContain(LABEL);
    expect(sql).toContain(BASIS);
  });

  it("listFindingsQuery reads them with the fallback too, through the alias of the table", async () => {
    query.mockResolvedValue([{ total: 0 }]);

    await listFindingsQuery(3, { limit: 10, offset: 0 });

    const rows = sent(0).sql;
    expect(rows).toContain(LABEL_OF_F);
    expect(rows).toContain(BASIS_OF_F);
    expect(rows).toContain("f.confidence");
    // The count reads no columns.
    expect(sent(1).sql).not.toContain("legacy_confidence");
  });

  it("every one of them still names the confidence column, to read", async () => {
    query.mockResolvedValue([{ id: 1 }]);

    await getFindingByIdQuery(3, 9);

    expect(sent().sql).toMatch(/risk_level, confidence, COALESCE/);
  });

  it("every one of them is filtered on the organization", async () => {
    query.mockResolvedValue([{ id: 1 }]);

    await getFindingByIdQuery(3, 9);
    await getFindingsForVendorQuery(3, 4);
    await listFindingsQuery(3, { limit: 10, offset: 0 });
    await markFindingDismissedQuery(
      { organizationId: 3, id: 9, reason: "other", note: null, userId: 1 },
      TRANSACTION,
    );

    for (let call = 0; call < query.mock.calls.length; call += 1) {
      expect(sent(call).sql).toMatch(/organization_id = :organizationId/);
    }
  });
});
