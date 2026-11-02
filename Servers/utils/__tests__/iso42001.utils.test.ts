const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

jest.mock("../changeHistory.base.utils", () => ({
  ...jest.requireActual("../changeHistory.base.utils"),
  recordUpdateChanges: jest.fn(),
}));

import {
  createNewSubClausesQuery,
  createNewAnnexeCategoriesQuery,
  updateAnnexCategoryQuery,
} from "../iso42001.utils";
import { recordUpdateChanges } from "../changeHistory.base.utils";
import { STATUSES } from "../../types/status.type";

const transaction = {} as any;
const DEMO_OWNER = 42;

const mockInserts = (count: number) => {
  for (let i = 1; i <= count; i++) {
    mockQuery.mockResolvedValueOnce([[{ id: i }]]);
  }
};

const replacementsOf = (callIndex: number) => mockQuery.mock.calls[callIndex][1].replacements;

describe("createNewSubClausesQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("assigns the demo owner and walks statuses in order for demo data", async () => {
    mockInserts(3);

    await createNewSubClausesQuery([1, 2, 3], 7, false, [], 1, transaction, true, DEMO_OWNER);

    expect(replacementsOf(0)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[0] });
    expect(replacementsOf(1)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[1] });
    expect(replacementsOf(2)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[2] });
  });

  it("leaves owner unset and starts at 'Not started' for a real project", async () => {
    mockInserts(2);

    await createNewSubClausesQuery([1, 2], 7, false, [], 1, transaction, false, DEMO_OWNER);

    expect(replacementsOf(0)).toMatchObject({ owner: null, status: "Not started" });
    expect(replacementsOf(1)).toMatchObject({ owner: null, status: "Not started" });
  });
});

describe("createNewAnnexeCategoriesQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("assigns the demo owner and walks statuses in order for demo data", async () => {
    mockInserts(3);

    await createNewAnnexeCategoriesQuery([1, 2, 3], 7, [], false, 1, transaction, true, DEMO_OWNER);

    expect(replacementsOf(0)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[0] });
    expect(replacementsOf(1)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[1] });
    expect(replacementsOf(2)).toMatchObject({ owner: DEMO_OWNER, status: STATUSES[2] });
  });

  it("leaves owner unset and starts at 'Not started' for a real project", async () => {
    mockInserts(2);

    await createNewAnnexeCategoriesQuery([1, 2], 7, [], false, 1, transaction, false, DEMO_OWNER);

    expect(replacementsOf(0)).toMatchObject({ owner: null, status: "Not started" });
    expect(replacementsOf(1)).toMatchObject({ owner: null, status: "Not started" });
  });
});

// The annex drawer sends multipart strings: is_applicable as "false" and the
// due date as dayjs toString(). History must diff what was stored, or every
// save records changes nobody made.
describe("updateAnnexCategoryQuery change history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it("locks the row for the snapshot and diffs the stored values, not the form strings", async () => {
    const stored = { is_applicable: false, due_date: "2026-10-28", status: "Done" };
    mockQuery
      .mockResolvedValueOnce([stored]) // before snapshot
      .mockResolvedValueOnce([[{ id: 3, ...stored }], 1]) // UPDATE ... RETURNING
      .mockResolvedValue([[], 0]);

    await updateAnnexCategoryQuery(
      3,
      {
        is_applicable: "false" as any,
        due_date: "Wed, 28 Oct 2026 04:00:00 GMT" as any,
        status: "Done" as any,
      },
      [],
      [],
      1,
      transaction,
      7,
    );

    expect(String(mockQuery.mock.calls[0][0])).toMatch(/FOR UPDATE/);
    expect(recordUpdateChanges).toHaveBeenCalledWith(
      "annex_category",
      3,
      stored,
      { id: 3, is_applicable: false, due_date: "2026-10-28", status: "Done" },
      7,
      1,
      transaction,
    );
  });
});
