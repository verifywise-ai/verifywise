jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { buildScoringAnswers, MAX_ANSWER_CHARS, MAX_TOTAL_ANSWER_CHARS } from "../scoringInput";

const schema = (fields: any[]) => ({ version: "1", fields });

describe("buildScoringAnswers", () => {
  it("omits email-type fields", () => {
    const out = buildScoringAnswers(
      { e: "a@b.com", t: "hello" },
      schema([
        { id: "e", type: "email", label: "Contact" },
        { id: "t", type: "text", label: "Name" },
      ]),
    );
    expect(out.map((a) => a.questionId)).toEqual(["t"]);
  });

  it("uses the option label for a select answer", () => {
    const out = buildScoringAnswers(
      { s: "option1" },
      schema([
        {
          id: "s",
          type: "select",
          label: "Sector",
          options: [{ value: "option1", label: "Healthcare" }],
        },
      ]),
    );
    expect(out[0]).toMatchObject({ questionId: "s", label: "Sector", text: "Healthcare" });
  });

  it("truncates a long textarea to MAX_ANSWER_CHARS", () => {
    const out = buildScoringAnswers(
      { t: "x".repeat(20000) },
      schema([{ id: "t", type: "textarea", label: "Details" }]),
    );
    expect(out[0].text).toHaveLength(MAX_ANSWER_CHARS);
    expect(MAX_ANSWER_CHARS).toBe(2000);
  });

  it("caps the total text at MAX_TOTAL_ANSWER_CHARS", () => {
    const fields = Array.from({ length: 20 }, (_, i) => ({
      id: `f${i}`,
      type: "textarea",
      label: `F${i}`,
    }));
    const data = Object.fromEntries(fields.map((f) => [f.id, "y".repeat(5000)]));
    const out = buildScoringAnswers(data, schema(fields));
    const total = out.reduce((n, a) => n + a.text.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_ANSWER_CHARS);
    expect(total).toBe(MAX_TOTAL_ANSWER_CHARS);
    expect(out.length).toBeLessThan(20);
  });

  it("carries the risk dimension", () => {
    const out = buildScoringAnswers(
      { t: "personal data" },
      schema([{ id: "t", type: "text", label: "Data", riskDimension: "data_privacy" }]),
    );
    expect(out[0].dimension).toBe("data_privacy");
  });

  it("omits blank answers and answers with no text", () => {
    const out = buildScoringAnswers(
      { a: "   ", b: [], c: "ok", d: 5 },
      schema([
        { id: "a", type: "text", label: "A" },
        { id: "b", type: "multiselect", label: "B" },
        { id: "c", type: "text", label: "C" },
        { id: "d", type: "number", label: "D" },
      ]),
    );
    expect(out.map((a) => a.questionId)).toEqual(["c"]);
  });
});
