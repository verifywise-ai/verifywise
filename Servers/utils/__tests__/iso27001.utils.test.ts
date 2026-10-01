const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { createNewSubClausesQuery, createNewAnnexControlsQuery } from "../iso27001.utils";
import { STATUSES } from "../../types/status.type";

const transaction = {} as any;
const DEMO_OWNER = 42;

const mockInserts = (count: number) => {
  for (let i = 1; i <= count; i++) {
    mockQuery.mockResolvedValueOnce([[{ id: i }]]);
  }
};

const replacementsOf = (callIndex: number) => mockQuery.mock.calls[callIndex][1].replacements;

describe("ISO 27001 demo seeding with demo text shorter than the struct table", () => {
  beforeEach(() => jest.clearAllMocks());

  // The struct tables are migration-seeded and outgrew the structure file:
  // subclauses_struct_iso27001 holds 26 rows, the ISO 27001:2022 structure
  // supplies 25 demo entries. Indexing past the end used to throw
  // "Cannot read properties of undefined (reading 'implementation_description')"
  // and roll back the whole demo seed.
  it("falls back to empty demo text for sub-clauses beyond the demo array", async () => {
    mockInserts(3);
    const demo = [
      { implementation_description: "first", auditor_feedback: "ok" },
      { implementation_description: "second", auditor_feedback: "ok" },
    ];

    await createNewSubClausesQuery(
      [1, 2, 3],
      7,
      true,
      demo,
      1,
      transaction,
      true,
      DEMO_OWNER,
      true,
    );

    expect(replacementsOf(0)).toMatchObject({ implementation_description: "first" });
    expect(replacementsOf(2)).toMatchObject({
      implementation_description: "",
      auditor_feedback: "",
    });
  });

  it("falls back to empty demo text for annex controls beyond the demo array", async () => {
    mockInserts(2);
    const demo = [{ implementation_description: "first", auditor_feedback: "ok" }];

    await createNewAnnexControlsQuery(
      [1, 2],
      7,
      demo,
      true,
      1,
      transaction,
      true,
      DEMO_OWNER,
      true,
    );

    expect(replacementsOf(0)).toMatchObject({ implementation_description: "first" });
    expect(replacementsOf(1)).toMatchObject({
      implementation_description: "",
      auditor_feedback: "",
    });
  });

  it("writes null demo text when AI data insertion is off", async () => {
    mockInserts(1);

    await createNewSubClausesQuery([1], 7, false, [], 1, transaction, false, DEMO_OWNER, false);

    expect(replacementsOf(0)).toMatchObject({
      implementation_description: null,
      auditor_feedback: null,
      status: "Not started",
      owner: null,
      is_demo: false,
    });
  });
});

describe("ISO 27001 demo seeding tags and owns rows like ISO 42001", () => {
  beforeEach(() => jest.clearAllMocks());

  it("walks statuses in order and marks sub-clauses as demo", async () => {
    mockInserts(3);

    await createNewSubClausesQuery([1, 2, 3], 7, false, [], 1, transaction, true, DEMO_OWNER, true);

    expect(replacementsOf(0)).toMatchObject({
      status: STATUSES[0],
      owner: DEMO_OWNER,
      is_demo: true,
    });
    expect(replacementsOf(1)).toMatchObject({ status: STATUSES[1], owner: DEMO_OWNER });
    expect(replacementsOf(2)).toMatchObject({ status: STATUSES[2], owner: DEMO_OWNER });
  });

  it("walks statuses in order and marks annex controls as demo", async () => {
    mockInserts(3);

    await createNewAnnexControlsQuery(
      [1, 2, 3],
      7,
      [],
      false,
      1,
      transaction,
      true,
      DEMO_OWNER,
      true,
    );

    expect(replacementsOf(0)).toMatchObject({
      status: STATUSES[0],
      owner: DEMO_OWNER,
      is_demo: true,
    });
    expect(replacementsOf(1)).toMatchObject({ status: STATUSES[1], owner: DEMO_OWNER });
    expect(replacementsOf(2)).toMatchObject({ status: STATUSES[2], owner: DEMO_OWNER });
  });
});
