import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const listDefinitions = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
jest.mock("../customField.utils", () => ({
  ISO_DATE_PATTERN: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
  MAX_CUSTOM_TEXT_LENGTH: 10_000,
  listCustomFieldDefinitionsQuery: (...args: unknown[]) => listDefinitions(...args),
  setCustomFieldValueQuery: jest.fn(),
}));
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  previewIntakeCustomFields,
  resolveIntakeCustomFieldValues,
  validateFormCustomFieldMappings,
} from "../intakeCustomFields.utils";
import { buildEntityDataFromSubmission } from "../intakeSubmissionData.utils";

type Q = {
  id: string;
  type: string;
  label: string;
  options?: { value: string; label: string }[];
  entityFieldMapping?: string;
};
const schemaOf = (...fields: Q[]) => ({ fields }) as any;
const def = (over: Record<string, unknown>) =>
  ({ id: 1, field_key: "k", label: "Field K", field_type: "text", options: null, ...over }) as any;
const q = (over: Partial<Q>): Q => ({
  id: "q1",
  type: "text",
  label: "Question",
  entityFieldMapping: "custom_field:k",
  ...over,
});

const run = (question: Q, definition: any, answer: unknown) =>
  resolveIntakeCustomFieldValues(
    { [question.id]: answer },
    schemaOf(question),
    definition ? [definition] : [],
  );

describe("resolveIntakeCustomFieldValues", () => {
  it("passes text, date and checkbox through", () => {
    expect(run(q({}), def({}), "abc").values[0]).toMatchObject({
      definitionId: 1,
      fieldKey: "k",
      label: "Field K",
      value: "abc",
      displayValue: "abc",
    });
    expect(
      run(q({ type: "date" }), def({ field_type: "date" }), "2026-11-11").values[0].value,
    ).toBe("2026-11-11");
    const bool = run(q({ type: "checkbox" }), def({ field_type: "boolean" }), true).values[0];
    expect(bool.value).toBe(true);
    // The caller translates a boolean display into yes or no.
    expect(bool.displayValue).toBe(true);
  });

  it("parses numbers and skips unparseable ones", () => {
    const d = def({ field_type: "number" });
    const n = q({ type: "number" });
    expect(run(n, d, "12").values[0].value).toBe(12);
    expect(run(n, d, 12).values[0].value).toBe(12);
    expect(run(n, d, "abc")).toMatchObject({
      values: [],
      skipped: [{ fieldKey: "k", label: "Field K", reason: "invalid_value" }],
    });
    expect(run(n, d, "")).toEqual({ values: [], skipped: [], results: [] });
    expect(run(n, d, undefined)).toEqual({ values: [], skipped: [], results: [] });
  });

  it("maps a select answer to the custom option text", () => {
    const question = q({ type: "select", options: [{ value: "option2", label: "High" }] });
    const d = def({ field_type: "select", options: ["High", "Low"] });
    expect(run(question, d, "option2").values[0].value).toBe("High");
    expect(run(question, d, "high").values[0].value).toBe("High");
    expect(run(question, d, "Medium").skipped[0].reason).toBe("no_matching_option");
  });

  it("maps a select answer to a scored option id", () => {
    const question = q({ type: "select" });
    const d = def({
      field_type: "scored_select",
      options: [{ id: "s1", label: "High", score: 3 }],
    });
    const byLabel = run(question, d, "high").values[0];
    expect(byLabel.value).toBe("s1");
    expect(byLabel.displayValue).toBe("High");
    expect(run(question, d, "s1").values[0].value).toBe("s1");
  });

  it("maps multiselect answers, deduped, skipping on any miss", () => {
    const question = q({
      type: "multiselect",
      options: [
        { value: "option1", label: "A" },
        { value: "option2", label: "B" },
      ],
    });
    const d = def({ field_type: "multiselect", options: ["A", "B"] });
    const ok = run(question, d, ["option1", "option1", "option2"]).values[0];
    expect(ok.value).toEqual(["A", "B"]);
    expect(ok.displayValue).toBe("A, B");
    expect(run(question, d, ["option1", "zzz"]).skipped[0].reason).toBe("no_matching_option");
    expect(run(question, d, [])).toEqual({ values: [], skipped: [], results: [] });
  });

  it("skips removed and retyped definitions", () => {
    const removed = run(q({}), undefined, "abc");
    expect(removed.skipped).toEqual([
      { fieldKey: "k", label: "Question", reason: "field_removed" },
    ]);
    const retyped = run(q({}), def({ field_type: "number" }), "abc");
    expect(retyped.skipped[0].reason).toBe("type_changed");
  });

  it("names a skipped field by its definition label, except when the definition is gone", () => {
    const question = q({ label: "Your question" });
    expect(run(question, def({ field_type: "number" }), "abc").skipped).toEqual([
      { fieldKey: "k", label: "Field K", reason: "type_changed" },
    ]);
    const select = q({ type: "select", label: "Your question" });
    expect(
      run(select, def({ field_type: "select", options: ["Low"] }), "High").skipped[0].label,
    ).toBe("Field K");
    expect(
      run(q({ type: "number", label: "Your question" }), def({ field_type: "number" }), "x"),
    ).toMatchObject({ skipped: [{ label: "Field K", reason: "invalid_value" }] });
    expect(run(question, undefined, "abc").skipped[0].label).toBe("Your question");
  });

  it("ignores fields without a custom mapping", () => {
    const out = resolveIntakeCustomFieldValues(
      { q1: "x" },
      schemaOf(q({ entityFieldMapping: "project_title" })),
      [],
    );
    expect(out).toEqual({ values: [], skipped: [], results: [] });
  });

  it("lists every outcome in question order, a skip carrying the answer as given", () => {
    const out = resolveIntakeCustomFieldValues(
      { a: "t2", b: "Alice", c: true },
      schemaOf(
        q({
          id: "a",
          type: "select",
          entityFieldMapping: "custom_field:tier",
          options: [{ value: "t2", label: "Tier two" }],
        }),
        q({ id: "b", entityFieldMapping: "custom_field:owner" }),
        q({ id: "c", type: "checkbox", label: "OK?", entityFieldMapping: "custom_field:gone" }),
      ),
      [
        def({ id: 1, field_key: "tier", label: "Tier", field_type: "select", options: ["Low"] }),
        def({ id: 2, field_key: "owner", label: "Owner" }),
      ],
    );
    expect(out.results).toEqual([
      {
        status: "skipped",
        fieldKey: "tier",
        label: "Tier",
        reason: "no_matching_option",
        answerDisplay: "Tier two",
      },
      {
        status: "value",
        definitionId: 2,
        fieldKey: "owner",
        label: "Owner",
        value: "Alice",
        displayValue: "Alice",
      },
      {
        status: "skipped",
        fieldKey: "gone",
        label: "OK?",
        reason: "field_removed",
        answerDisplay: true,
      },
    ]);
    expect(out.values.map((v) => v.fieldKey)).toEqual(["owner"]);
    expect(out.skipped.map((v) => v.fieldKey)).toEqual(["tier", "gone"]);
  });
});

describe("previewIntakeCustomFields", () => {
  beforeEach(() => {
    listDefinitions.mockReset();
  });

  it("returns rows in question order with skip codes", async () => {
    listDefinitions.mockResolvedValue([def({ field_key: "owner", label: "Owner" })]);
    const rows = await previewIntakeCustomFields(
      "model",
      { a: ["x", "y"], b: "Alice" },
      schemaOf(
        q({
          id: "a",
          type: "multiselect",
          label: "Regions",
          entityFieldMapping: "custom_field:regions",
          options: [{ value: "x", label: "Europe" }],
        }),
        q({ id: "b", entityFieldMapping: "custom_field:owner" }),
      ),
      7,
    );
    expect(listDefinitions).toHaveBeenCalledWith(7, "model_inventory");
    expect(rows).toEqual([
      { label: "Regions", display: "Europe, y", skipReason: "field_removed" },
      { label: "Owner", display: "Alice" },
    ]);
  });

  it("returns null when the definitions cannot be read", async () => {
    listDefinitions.mockRejectedValue(new Error("db down"));
    expect(await previewIntakeCustomFields("model", { q1: "x" }, schemaOf(q({})), 7)).toBeNull();
  });

  it("returns [] without reading for an unknown entity or no custom mappings", async () => {
    expect(await previewIntakeCustomFields("nope", { q1: "x" }, schemaOf(q({})), 7)).toEqual([]);
    expect(
      await previewIntakeCustomFields(
        "model",
        { q1: "x" },
        schemaOf(q({ entityFieldMapping: "name" })),
        7,
      ),
    ).toEqual([]);
    expect(listDefinitions).not.toHaveBeenCalled();
  });
});

describe("write-time constraints", () => {
  it("skips dates the write would reject", () => {
    const d = def({ field_type: "date" });
    const dq = q({ type: "date" });
    expect(run(dq, d, "11/11/2026").skipped[0].reason).toBe("invalid_value");
    expect(run(dq, d, "2026-13-45").skipped[0].reason).toBe("invalid_value");
    expect(run(dq, d, "2026-11-11").values[0].value).toBe("2026-11-11");
  });

  it("skips text over the length limit", () => {
    expect(run(q({}), def({}), "x".repeat(10_001)).skipped[0].reason).toBe("invalid_value");
    expect(run(q({}), def({}), "x".repeat(10_000)).values).toHaveLength(1);
  });

  it("never matches a non-string single select answer", () => {
    const d = def({ field_type: "select", options: ["High"] });
    expect(run(q({ type: "select" }), d, ["High"]).skipped[0].reason).toBe("no_matching_option");
    expect(run(q({ type: "select" }), d, { toString: () => "High" }).skipped[0].reason).toBe(
      "no_matching_option",
    );
  });
});

describe("buildEntityDataFromSubmission", () => {
  it("leaves custom field mappings out", () => {
    const data = buildEntityDataFromSubmission(
      { q1: "abc", q2: "Title" },
      schemaOf(q({}), q({ id: "q2", entityFieldMapping: "project_title" })),
    );
    expect(Object.keys(data).some((k) => k.startsWith("custom_field:"))).toBe(false);
    expect(data.project_title).toBe("Title");
  });
});

describe("validateFormCustomFieldMappings", () => {
  beforeEach(() => {
    listDefinitions.mockReset();
  });

  it("reports a missing field by question label", async () => {
    listDefinitions.mockResolvedValue([]);
    const errors = await validateFormCustomFieldMappings(
      schemaOf(q({ label: "Owner", entityFieldMapping: "custom_field:owner" })),
      "model",
      7,
    );
    expect(errors).toEqual([{ label: "Owner", fieldKey: "owner", problem: "field_removed" }]);
    expect(listDefinitions).toHaveBeenCalledWith(7, "model_inventory", undefined);
  });

  it("reports an incompatible type", async () => {
    listDefinitions.mockResolvedValue([def({ field_key: "owner", field_type: "number" })]);
    const errors = await validateFormCustomFieldMappings(
      schemaOf(q({ label: "Owner", entityFieldMapping: "custom_field:owner" })),
      "model",
      7,
    );
    expect(errors).toEqual([{ label: "Owner", fieldKey: "owner", problem: "type_changed" }]);
  });

  it("returns [] for valid mappings", async () => {
    listDefinitions.mockResolvedValue([def({ field_key: "owner" })]);
    expect(
      await validateFormCustomFieldMappings(
        schemaOf(q({ entityFieldMapping: "custom_field:owner" })),
        "use_case",
        7,
      ),
    ).toEqual([]);
  });

  it("reports select options the custom field does not have", async () => {
    listDefinitions.mockResolvedValue([
      def({ field_key: "tier", field_type: "select", options: ["Low", "High"] }),
    ]);
    const question = q({
      type: "select",
      label: "Tier",
      entityFieldMapping: "custom_field:tier",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
      ],
    });
    expect(await validateFormCustomFieldMappings(schemaOf(question), "model", 7)).toEqual([
      { label: "Tier", fieldKey: "tier", problem: "options_mismatch" },
    ]);
    listDefinitions.mockResolvedValue([
      def({ field_key: "tier", field_type: "select", options: [" LOW", "medium "] }),
    ]);
    expect(await validateFormCustomFieldMappings(schemaOf(question), "model", 7)).toEqual([]);
  });

  it("issues no query without custom mappings or for an unknown entity type", async () => {
    expect(
      await validateFormCustomFieldMappings(schemaOf(q({ entityFieldMapping: "x" })), "model", 7),
    ).toEqual([]);
    expect(await validateFormCustomFieldMappings(schemaOf(q({})), "nonsense", 7)).toEqual([]);
    expect(await validateFormCustomFieldMappings(schemaOf(q({})), undefined, 7)).toEqual([]);
    expect(await validateFormCustomFieldMappings(undefined, "model", 7)).toEqual([]);
    expect(listDefinitions).not.toHaveBeenCalled();
  });
});
