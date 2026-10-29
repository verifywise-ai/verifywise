const utils = {
  getProjectQuery: jest.fn(),
  userCanAccessProjectQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);

import { answerMapFromRows, assertProject, isUniqueViolation } from "./serviceHelpers";

beforeEach(() => Object.values(utils).forEach((f) => f.mockReset()));

const rows = [
  {
    question_key: "role.party",
    answer_value: "vendor",
    answer_notes: "We supply it.",
    is_dont_know: false,
  },
  { question_key: "data.held", answer_value: null, answer_notes: null, is_dont_know: true },
  { question_key: "data.basis", answer_value: undefined, answer_notes: undefined, is_dont_know: 0 },
] as any[];

describe("answerMapFromRows", () => {
  it("keeps the customer's notes when asked, for the profile and the stance", () => {
    expect(answerMapFromRows(rows, "with_notes")).toEqual({
      "role.party": { value: "vendor", notes: "We supply it.", dontKnow: false },
      "data.held": { value: null, notes: null, dontKnow: true },
      "data.basis": { value: null, notes: null, dontKnow: false },
    });
  });

  it("leaves notes out when asked, for the run, which reads values only", () => {
    const out = answerMapFromRows(rows, "without_notes");
    expect(out).toEqual({
      "role.party": { value: "vendor", dontKnow: false },
      "data.held": { value: null, dontKnow: true },
      "data.basis": { value: null, dontKnow: false },
    });
    expect(Object.values(out).some((a) => "notes" in a)).toBe(false);
  });

  it("maps no rows to an empty map", () => {
    expect(answerMapFromRows([], "with_notes")).toEqual({});
  });
});

describe("isUniqueViolation", () => {
  it("recognises a Postgres unique violation and Sequelize's wrapper for it", () => {
    expect(isUniqueViolation({ original: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ name: "SequelizeUniqueConstraintError" })).toBe(true);
  });

  it("is false for anything else", () => {
    for (const e of [new Error("boom"), { original: { code: "23503" } }, null, undefined, "x"]) {
      expect(isUniqueViolation(e)).toBe(false);
    }
  });
});

describe("assertProject", () => {
  it("checks access, then returns the project in the organization", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    await expect(assertProject(7, 42, { userId: 9, role: "Editor" })).resolves.toEqual({
      id: 7,
      project_title: "Screener",
    });
    expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
    expect(utils.getProjectQuery).toHaveBeenCalledWith(7, 42);
  });

  it("answers a project missing from the organization with a not-found", async () => {
    utils.getProjectQuery.mockResolvedValue(null);
    await expect(assertProject(7, 42, { userId: 9, role: "Admin" })).rejects.toMatchObject({
      statusCode: 404,
      message: "Project 7 was not found",
    });
  });

  it("refuses a non-member before reading the project", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(false);
    await expect(assertProject(7, 42, { userId: 9, role: "Editor" })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(utils.getProjectQuery).not.toHaveBeenCalled();
  });
});
