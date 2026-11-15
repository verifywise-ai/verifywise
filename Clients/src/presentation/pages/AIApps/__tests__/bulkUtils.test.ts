import { describe, expect, it } from "vitest";
import { mapImportRows, mapWorksheetRows } from "../bulkUtils";

const questions = [
  { key: "q1", label: "Data sensitivity", weight: 1 },
  { key: "q2", label: "User exposure", weight: 2 },
];

describe("mapImportRows", () => {
  it("keeps row numbers and matches template headers loosely", () => {
    const result = mapImportRows({
      headers: ["Name *", "Owner email (optional)", "required_training", "Notes"],
      rows: [
        {
          row_number: 7,
          values: {
            "Name *": "Copilot",
            "Owner email (optional)": "a@b.co",
            "required_training": 12,
            "Notes": "ignored",
          },
        },
      ],
    });

    expect(result.hasNameColumn).toBe(true);
    expect(result.rows).toEqual([
      {
        row_number: 7,
        name: "Copilot",
        description: "",
        vendor: "",
        owner_email: "a@b.co",
        status: "",
        departments: "",
        required_training: "12",
      },
    ]);
  });

  it("reports a file without a name column", () => {
    expect(mapImportRows({ headers: ["Vendor"], rows: [] }).hasNameColumn).toBe(false);
  });
});

describe("mapWorksheetRows", () => {
  const headers = ["Assessment ID", "AI app", "data sensitivity", "User  exposure"];

  it("maps labels to question keys, in any case", () => {
    const result = mapWorksheetRows(
      {
        headers,
        rows: [
          {
            row_number: 4,
            values: {
              "Assessment ID": 12,
              "AI app": "Copilot",
              "data sensitivity": 3,
              "User  exposure": "5 - Very high",
            },
          },
        ],
      },
      questions,
    );

    expect(result).toEqual({
      rows: [{ row_number: 4, assessment_id: 12, answers: { q1: 3, q2: 5 } }],
      errors: [],
      missingColumns: [],
    });
  });

  it("keeps a blank row as no answers and leaves bad values for the server", () => {
    const result = mapWorksheetRows(
      {
        headers,
        rows: [
          {
            row_number: 2,
            values: { "Assessment ID": 1, "data sensitivity": null, "User  exposure": null },
          },
          {
            row_number: 3,
            values: { "Assessment ID": 2, "data sensitivity": "high", "User  exposure": 9 },
          },
        ],
      },
      questions,
    );

    expect(result.rows[0].answers).toEqual({});
    expect(result.rows[1].answers).toEqual({ q1: "high", q2: 9 });
  });

  it("lists the columns a changed questionnaire no longer finds", () => {
    const result = mapWorksheetRows(
      { headers: ["Assessment ID", "Data sensitivity"], rows: [] },
      questions,
    );
    expect(result.missingColumns).toEqual(["User exposure"]);
  });

  it("reports a row whose assessment ID cannot be read", () => {
    const result = mapWorksheetRows(
      {
        headers,
        rows: [
          {
            row_number: 9,
            values: { "Assessment ID": null, "data sensitivity": 1, "User  exposure": 1 },
          },
        ],
      },
      questions,
    );
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatchObject({ row: 9, field: "Assessment ID" });
  });
});
