import { AiAppStatus } from "../../domain.layer/enums/ai-app-status.enum";
import {
  AiAppQuestion,
  calculateAssessmentScore,
  canActOnApp,
  canAnswerAssessment,
  cellText,
  evaluateAnswers,
  evaluateWorksheetRows,
  groupOwnerSummaries,
  ImportReferenceData,
  parseAiAppStatus,
  parseAnswerValue,
  parseIdList,
  parseImportRows,
  parseQuestionnaireBody,
  questionKey,
  planImport,
  WorksheetAssessment,
} from "../validations/aiAppBulkValidation.utils";

const importRow = (overrides: Record<string, unknown> = {}) => ({
  row_number: 2,
  name: "ChatGPT",
  description: "",
  vendor: "",
  owner_email: "",
  status: "",
  departments: "",
  required_training: "",
  ...overrides,
});

const questions: AiAppQuestion[] = [
  { key: "q1", label: "Data sensitivity", weight: 1 },
  { key: "q2", label: "User exposure", weight: 3 },
];

describe("cellText", () => {
  it("trims strings, coerces numbers and treats nothing as blank", () => {
    expect(cellText("  a ")).toEqual({ ok: true, text: "a" });
    expect(cellText(42)).toEqual({ ok: true, text: "42" });
    expect(cellText(null)).toEqual({ ok: true, text: "" });
    expect(cellText(undefined)).toEqual({ ok: true, text: "" });
  });

  it("rejects objects, arrays, booleans and non-finite numbers", () => {
    for (const value of [{}, [], true, NaN, Infinity]) {
      expect(cellText(value)).toEqual({ ok: false });
    }
  });
});

describe("parseIdList", () => {
  it("de-duplicates and accepts integer strings", () => {
    expect(parseIdList([1, "2", 1])).toEqual([1, 2]);
  });

  it("rejects anything that isn't a list of 1 to max valid ids", () => {
    for (const value of [[], "1", null, [0], [-1], [1.5], ["2abc"], [[2]], [2147483648]]) {
      expect(parseIdList(value)).toBeNull();
    }
    expect(parseIdList([1, 2, 3], 2)).toBeNull();
  });
});

describe("parseAiAppStatus", () => {
  it.each([
    ["draft", AiAppStatus.DRAFT],
    ["UNDER_REVIEW", AiAppStatus.UNDER_REVIEW],
    ["under review", AiAppStatus.UNDER_REVIEW],
    ["Under Review", AiAppStatus.UNDER_REVIEW],
    [" Approved ", AiAppStatus.APPROVED],
    ["restricted", AiAppStatus.RESTRICTED],
    ["BANNED", AiAppStatus.BANNED],
  ])("maps %s", (input, expected) => {
    expect(parseAiAppStatus(input)).toBe(expected);
  });

  it("returns null for anything else", () => {
    expect(parseAiAppStatus("under-review")).toBeNull();
    expect(parseAiAppStatus("live")).toBeNull();
  });
});

describe("parseImportRows", () => {
  it("reports a department too long to store", () => {
    const { errors } = parseImportRows([importRow({ departments: `Sales, ${"x".repeat(256)}` })]);
    expect(errors.map((error) => error.field)).toContain("departments");
  });

  it("defaults the status to draft and keeps a clean row", () => {
    const { parsed, errors } = parseImportRows([importRow()]);
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({ row: 2, status: AiAppStatus.DRAFT, invalid: false });
  });

  it("uses row_number in errors, so blank lines don't shift them", () => {
    const { errors } = parseImportRows([importRow({ row_number: 17, name: " " })]);
    expect(errors).toEqual([{ row: 17, field: "name", message: "Name is required" }]);
  });

  it("rejects a name over 255 characters", () => {
    const { errors } = parseImportRows([importRow({ name: "x".repeat(256) })]);
    expect(errors[0].field).toBe("name");
  });

  it("reports a repeated name on the later row, ignoring case and spaces", () => {
    const { errors } = parseImportRows([
      importRow({ row_number: 2, name: "ChatGPT" }),
      importRow({ row_number: 3, name: "  chatgpt " }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 3, field: "name" });
  });

  it("coerces numeric cells and rejects object cells", () => {
    const numeric = parseImportRows([importRow({ name: 2024, vendor: 7 })]);
    expect(numeric.errors).toEqual([]);
    expect(numeric.parsed[0]).toMatchObject({ name: "2024", vendor: "7" });

    const object = parseImportRows([importRow({ vendor: { text: "x" } })]);
    expect(object.errors[0]).toMatchObject({ field: "vendor", message: "Vendor must be text" });
    expect(object.parsed[0].invalid).toBe(true);
  });

  it("rejects an unknown status and a row that isn't an object", () => {
    expect(parseImportRows([importRow({ status: "live" })]).errors[0].field).toBe("status");
    expect(parseImportRows(["nope"]).errors[0]).toMatchObject({ row: 1, field: "row" });
  });

  it("flags a bad row_number but still reports against the position", () => {
    const { errors } = parseImportRows([importRow({ row_number: "x" })]);
    expect(errors[0]).toMatchObject({ row: 1, field: "row_number" });
  });
});

describe("planImport", () => {
  const reference = (): ImportReferenceData => ({
    existingAppNameKeys: new Set(["existing"]),
    vendorIdsByKey: new Map([["openai", 9]]),
    userIdsByEmail: new Map([["a@x.com", 4]]),
  });

  const plan = (rows: Record<string, unknown>[]) => {
    const { parsed, errors } = parseImportRows(rows);
    return planImport(parsed, errors, reference());
  };

  it("skips an existing name without checking its owner or adding its vendor", () => {
    const result = plan([
      importRow({ name: " EXISTING ", owner_email: "nobody@x.com", vendor: "New Co" }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.newVendors.size).toBe(0);
  });

  it("matches vendors ignoring case and lists one new vendor once", () => {
    const result = plan([
      importRow({ row_number: 2, name: "A", vendor: "OPENAI" }),
      importRow({ row_number: 3, name: "B", vendor: "Acme" }),
      importRow({ row_number: 4, name: "C", vendor: "ACME " }),
    ]);
    expect(result.toCreate[0].vendorId).toBe(9);
    expect([...result.newVendors.values()]).toEqual(["Acme"]);
    expect(result.toCreate[2].newVendorKey).toBe("acme");
  });

  it("requires an owner email to belong to the organization, ignoring case", () => {
    expect(plan([importRow({ owner_email: "A@X.com" })]).toCreate[0].ownerId).toBe(4);
    const missing = plan([importRow({ owner_email: "other@x.com" })]);
    expect(missing.errors[0]).toMatchObject({ field: "owner_email" });
    expect(missing.toCreate).toHaveLength(0);
  });

  it("leaves a blank owner unowned", () => {
    expect(plan([importRow()]).toCreate[0].ownerId).toBeNull();
  });
});

describe("parseQuestionnaireBody", () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    name: "Q",
    questions: [{ label: "A", weight: 2 }],
    ...overrides,
  });

  it("keeps a question's key when the questions are reordered", () => {
    const parse = (labels: string[]) => {
      const result = parseQuestionnaireBody(
        body({ questions: labels.map((label) => ({ label, weight: 1 })) }),
        { partial: false },
      );
      if (!result.ok) throw new Error(result.message);
      return Object.fromEntries(result.value.questions!.map((q) => [q.label, q.key]));
    };
    expect(parse(["A", "B"])).toEqual(parse(["B", "A"]));
  });

  it("treats labels differing only in whitespace as duplicates", () => {
    const result = parseQuestionnaireBody(
      body({
        questions: [
          { label: "Data use", weight: 1 },
          { label: "Data  use", weight: 1 },
        ],
      }),
      { partial: false },
    );
    expect(result).toEqual({ ok: false, message: "Question labels must be unique" });
  });

  it("refuses a fixed worksheet column with extra whitespace", () => {
    const result = parseQuestionnaireBody(
      body({ questions: [{ label: "Assessment  ID", weight: 1 }] }),
      { partial: false },
    );
    expect(result.ok).toBe(false);
  });

  it("derives keys from labels and ignores keys sent by the client", () => {
    const result = parseQuestionnaireBody(
      body({
        questions: [
          { key: "zzz", label: " A ", weight: 1 },
          { label: "B", weight: 5, description: " d " },
        ],
      }),
      { partial: false },
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Q",
        questions: [
          { key: questionKey("A"), label: "A", weight: 1 },
          { key: questionKey("B"), label: "B", weight: 5, description: "d" },
        ],
      },
    });
  });

  it.each([
    ["missing name", { name: undefined }],
    ["blank name", { name: "  " }],
    ["non-string name", { name: 5 }],
    ["no questions", { questions: [] }],
    ["questions not a list", { questions: "x" }],
    ["question not an object", { questions: ["x"] }],
    ["weight too high", { questions: [{ label: "A", weight: 6 }] }],
    ["weight too low", { questions: [{ label: "A", weight: 0 }] }],
    ["weight not whole", { questions: [{ label: "A", weight: 1.5 }] }],
    ["weight as text", { questions: [{ label: "A", weight: "2" }] }],
    ["blank label", { questions: [{ label: " ", weight: 1 }] }],
    [
      "duplicate label ignoring case",
      {
        questions: [
          { label: "A", weight: 1 },
          { label: " a", weight: 1 },
        ],
      },
    ],
    ["label equal to a worksheet column", { questions: [{ label: "assessment id", weight: 1 }] }],
  ])("rejects %s", (_name, overrides) => {
    expect(parseQuestionnaireBody(body(overrides), { partial: false }).ok).toBe(false);
  });

  it("allows a partial update and refuses an empty one", () => {
    expect(parseQuestionnaireBody({ name: "New" }, { partial: true })).toEqual({
      ok: true,
      value: { name: "New" },
    });
    expect(parseQuestionnaireBody({}, { partial: true }).ok).toBe(false);
  });
});

describe("calculateAssessmentScore", () => {
  it("is the weighted average on a 0-100 scale", () => {
    expect(calculateAssessmentScore(questions, { q1: 1, q2: 5 })).toBe(80);
    expect(calculateAssessmentScore(questions, { q1: 1, q2: 1 })).toBe(20);
    expect(calculateAssessmentScore(questions, { q1: 5, q2: 5 })).toBe(100);
  });

  it("rounds to the nearest whole number", () => {
    const three = [
      { key: "q1", label: "a", weight: 1 },
      { key: "q2", label: "b", weight: 1 },
      { key: "q3", label: "c", weight: 1 },
    ];
    expect(calculateAssessmentScore(three, { q1: 1, q2: 1, q3: 2 })).toBe(27);
  });

  it("is zero with no weight at all", () => {
    expect(calculateAssessmentScore([], {})).toBe(0);
  });
});

describe("parseAnswerValue", () => {
  it("accepts 1 to 5 as numbers or numeric text", () => {
    expect(parseAnswerValue(3)).toBe(3);
    expect(parseAnswerValue(" 4 ")).toBe(4);
    expect(parseAnswerValue("5.0")).toBe(5);
  });

  it("rejects everything else", () => {
    for (const value of [0, 6, 2.5, "2.5", "x", "", null, {}, true]) {
      expect(parseAnswerValue(value)).toBeNull();
    }
  });
});

describe("evaluateAnswers", () => {
  it("accepts answers keyed by key or by label", () => {
    expect(evaluateAnswers(questions, { q1: 1, "user exposure": "2" })).toEqual({
      kind: "answered",
      answers: { q1: 1, q2: 2 },
    });
  });

  it("treats no answers, an empty object and blank values as blank", () => {
    for (const value of [undefined, null, {}, { q1: "", q2: null }, { Other: " " }]) {
      expect(evaluateAnswers(questions, value)).toEqual({ kind: "blank" });
    }
  });

  it("refuses a partly answered set and names what's missing", () => {
    const result = evaluateAnswers(questions, { q1: 1 });
    expect(result.kind).toBe("invalid");
    expect(JSON.stringify(result)).toContain("User exposure");
  });

  it("refuses unknown questions, bad values and non-objects", () => {
    expect(evaluateAnswers(questions, { q1: 1, q2: 2, q9: 3 }).kind).toBe("invalid");
    expect(evaluateAnswers(questions, { q1: 9, q2: 2 }).kind).toBe("invalid");
    expect(evaluateAnswers(questions, [1, 2]).kind).toBe("invalid");
    expect(evaluateAnswers(questions, "x").kind).toBe("invalid");
  });
});

describe("evaluateWorksheetRows", () => {
  const assessments = new Map<number, WorksheetAssessment>([
    [1, { id: 1, ai_app_id: 11, status: "pending" }],
    [2, { id: 2, ai_app_id: 12, status: "pending" }],
    [3, { id: 3, ai_app_id: 13, status: "completed" }],
  ]);
  const row = (assessment_id: unknown, answers?: unknown, row_number: unknown = 5) => ({
    row_number,
    assessment_id,
    answers,
  });

  it("completes full rows with a score and leaves blank rows pending", () => {
    const result = evaluateWorksheetRows(
      [row(1, { q1: 1, q2: 5 }), row(2, {})],
      questions,
      assessments,
    );
    expect(result.errors).toEqual([]);
    expect(result.leftBlank).toBe(1);
    expect(result.completions).toEqual([
      { assessmentId: 1, aiAppId: 11, answers: { q1: 1, q2: 5 }, score: 80 },
    ]);
  });

  it("counts an already completed assessment without checking its answers", () => {
    const result = evaluateWorksheetRows([row(3, { q1: 99 })], questions, assessments);
    expect(result).toMatchObject({ alreadyCompleted: 1, errors: [], completions: [] });
  });

  it("reports an unknown assessment even on a blank row", () => {
    const result = evaluateWorksheetRows([row(404)], questions, assessments);
    expect(result.errors).toEqual([
      { row: 5, field: "assessment_id", message: "Unknown assessment" },
    ]);
  });

  it("reports a partly answered row and a value out of range", () => {
    const result = evaluateWorksheetRows(
      [row(1, { q1: 1 }, 7), row(2, { q1: 9, q2: 1 }, 8)],
      questions,
      assessments,
    );
    expect(result.errors.map((error) => error.row)).toEqual([7, 8]);
  });

  it("reports an assessment listed twice on the later row", () => {
    const result = evaluateWorksheetRows(
      [row(1, {}, 2), row(1, { q1: 1, q2: 1 }, 3)],
      questions,
      assessments,
    );
    expect(result.errors).toEqual([
      {
        row: 3,
        field: "assessment_id",
        message: "This assessment appears more than once in the file",
      },
    ]);
  });

  it("rejects non-object rows and non-integer ids", () => {
    const result = evaluateWorksheetRows(["x", row("abc")], questions, assessments);
    expect(result.errors.map((error) => error.field)).toEqual(["row", "assessment_id"]);
  });
});

describe("canActOnApp", () => {
  const owner = { userId: 7, canEditAny: false };
  const editor = { userId: 8, canEditAny: true };

  it("lets an editor act on any app, owned or not", () => {
    expect(canActOnApp(7, editor)).toBe(true);
    expect(canActOnApp(null, editor)).toBe(true);
  });

  it("lets a non-editor act only on their own app", () => {
    expect(canActOnApp(7, owner)).toBe(true);
    expect(canActOnApp(9, owner)).toBe(false);
    expect(canActOnApp(null, owner)).toBe(false);
    expect(canActOnApp(undefined, owner)).toBe(false);
  });

  it("turns off can_answer once completed, even for an editor", () => {
    expect(canAnswerAssessment("pending", 7, owner)).toBe(true);
    expect(canAnswerAssessment("pending", 9, owner)).toBe(false);
    expect(canAnswerAssessment("completed", 7, owner)).toBe(false);
    expect(canAnswerAssessment("completed", 7, editor)).toBe(false);
  });
});

describe("groupOwnerSummaries", () => {
  it("gives each distinct owner one summary with their count", () => {
    const { summaries } = groupOwnerSummaries([5, 6, 5, 5, 6, 7], 1);
    expect(summaries).toEqual([
      { ownerId: 5, count: 3 },
      { ownerId: 6, count: 2 },
      { ownerId: 7, count: 1 },
    ]);
  });

  it("skips the requester but doesn't call their apps unassigned", () => {
    expect(groupOwnerSummaries([1, 1, 5], 1)).toEqual({
      summaries: [{ ownerId: 5, count: 1 }],
      unassigned: 0,
    });
  });

  it("counts apps with no owner as unassigned", () => {
    expect(groupOwnerSummaries([null, null, 5], 1)).toEqual({
      summaries: [{ ownerId: 5, count: 1 }],
      unassigned: 2,
    });
  });
});
