const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { createNewSubClausesQuery, createNewAnnexeCategoriesQuery } from "../iso42001.utils";
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
