jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import {
  FormSchema,
  keywordScoreFor,
  scoreSubmissionRuleBased,
} from "../intakeRiskScoring.service";

const schema: FormSchema = {
  version: "1",
  fields: [{ id: "q1", type: "textarea", label: "Purpose" }],
};

describe("keywordScoreFor", () => {
  it("returns the six dimensions without signals and their weighted average", () => {
    const data = { q1: "Biometric and medical records of patients" };
    const result = keywordScoreFor(data, schema)!;
    const dimensions = scoreSubmissionRuleBased(data, schema);

    expect(result.dimensions).toHaveLength(6);
    expect(result.dimensions).toEqual(
      dimensions.map(({ key, label, weight, score }) => ({ key, label, weight, score })),
    );
    expect(result.overallScore).toBe(
      Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)),
    );
    expect(result.dimensions.find((d) => d.key === "data_sensitivity")?.score).toBeGreaterThan(50);
  });

  // Every dimension would sit at the neutral 50, which says nothing about the risk.
  it("gives no score when no keyword matched", () => {
    expect(keywordScoreFor({ q1: "Screening job applicants" }, schema)).toBeNull();
    expect(keywordScoreFor({}, schema)).toBeNull();
  });
});
