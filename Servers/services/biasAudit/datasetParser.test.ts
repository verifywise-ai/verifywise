import { parseDataset } from "./datasetParser";

describe("parseDataset", () => {
  it("maps columns by the supplied mapping", () => {
    const csv = "cand,gender,race,outcome\n1,Male,White,1\n2,Female,Asian,0\n";
    const out = parseDataset(csv, {
      sex: "gender",
      race_ethnicity: "race",
      selected: "outcome",
    });
    expect(out.mappingErrors).toEqual([]);
    expect(out.records).toHaveLength(2);
    expect(out.records[0]).toMatchObject({ sex: "Male", race_ethnicity: "White" });
  });

  // Review Focus 4
  it("names the mapping when a mapped column is absent", () => {
    const csv = "cand,gender,outcome\n1,Male,1\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "ethnicity" });
    expect(out.mappingErrors).toHaveLength(1);
    expect(out.mappingErrors[0]).toContain("ethnicity");
    expect(out.mappingErrors[0]).toContain("race_ethnicity");
    expect(out.mappingErrors[0]).toMatch(/not present|no column/i);
    // The message blames the mapping, not the data.
    expect(out.mappingErrors[0]).not.toMatch(/missing data|incomplete data/i);
  });

  it("does not report its own unknown count, which runAudit provides", () => {
    const out = parseDataset("gender,outcome\nMale,1\n,0\n", {
      sex: "gender",
      selected: "outcome",
    });
    expect(out).not.toHaveProperty("unknownCount");
    expect(out.records[1].sex).toBe("");
  });

  it("reads 1/0, true/false and yes/no as the outcome", () => {
    const csv = "gender,outcome\nMale,1\nFemale,true\nMale,yes\nFemale,0\n";
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.records.map((r) => r.selected)).toEqual([true, true, true, false]);
  });

  it("counts a blank outcome separately from an unreadable one", () => {
    const out = parseDataset("gender,outcome\nMale,\nFemale,  \nMale,1\n", {
      sex: "gender",
      selected: "outcome",
    });
    expect(out.records[0].selected).toBe(false);
    expect(out.blankOutcomeCount).toBe(2);
    expect(out.unreadableOutcomeCount).toBe(0);
  });

  it("counts no blank outcomes when the outcome column is not mapped", () => {
    const out = parseDataset("gender,outcome\nMale,\n", { sex: "gender" });
    expect(out.blankOutcomeCount).toBe(0);
  });

  // A row with more or fewer cells than the header has its values under the
  // wrong columns, so its demographics and outcome cannot be trusted.
  it("counts rows whose cell count differs from the header's", () => {
    const csv = "gender,race,outcome\nMale,White,1\nFemale,1\nMale,White,0,extra\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "race", selected: "outcome" });
    expect(out.wrongWidthRowCount).toBe(2);
  });

  it("does not count blank cells after the last column as a wrong-width row", () => {
    const csv = "gender,race,outcome\nMale,White,1,\nFemale,Asian,0, ,\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "race", selected: "outcome" });
    expect(out.records).toHaveLength(2);
    expect(out.wrongWidthRowCount).toBe(0);
  });

  it("still counts a missing named cell or a value under a blank trailing header", () => {
    const csv = "gender,race,outcome,\nMale,White\nFemale,Asian,0,extra\nMale,White,1\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "race", selected: "outcome" });
    expect(out.wrongWidthRowCount).toBe(2);
  });

  it("does not count rows as short when the header ends in a blank name", () => {
    const csv = "gender,race,outcome,\nMale,White,1\nFemale,Asian,0\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "race", selected: "outcome" });
    expect(out.wrongWidthRowCount).toBe(0);
  });

  it("does not count a trailing empty line, or a quoted newline, as a short row", () => {
    const out = parseDataset('gender,note,outcome\nMale,"a\nb",1\nFemale,x,0\n\n', {
      sex: "gender",
      selected: "outcome",
    });
    expect(out.records).toHaveLength(2);
    expect(out.wrongWidthRowCount).toBe(0);
  });

  // Spreadsheet exports often end with full-width rows of empty cells. Such a
  // row carries no applicant, so it must not count as a record, a blank
  // outcome or a wrong-width row.
  it("skips trailing rows whose cells are all blank", () => {
    const out = parseDataset("gender,race,outcome\nMale,White,1\nFemale,Asian,0\n,,\n , ,\n,,\n", {
      sex: "gender",
      race_ethnicity: "race",
      selected: "outcome",
    });
    expect(out.records).toHaveLength(2);
    expect(out.blankOutcomeCount).toBe(0);
    expect(out.wrongWidthRowCount).toBe(0);
  });

  it("skips an all-blank row in the middle of the data", () => {
    const out = parseDataset("gender,race,outcome\nMale,White,1\n,,,,\nFemale,Asian,0\n", {
      sex: "gender",
      race_ethnicity: "race",
      selected: "outcome",
    });
    expect(out.records).toHaveLength(2);
    expect(out.records.map((r) => r.sex)).toEqual(["Male", "Female"]);
    expect(out.blankOutcomeCount).toBe(0);
    expect(out.wrongWidthRowCount).toBe(0);
  });

  it("still counts a row with a value and a blank outcome", () => {
    const out = parseDataset("gender,race,outcome\nMale,,\n", {
      sex: "gender",
      race_ethnicity: "race",
      selected: "outcome",
    });
    expect(out.records).toHaveLength(1);
    expect(out.blankOutcomeCount).toBe(1);
  });

  it("counts outcome values it cannot read instead of silently calling them not selected", () => {
    const out = parseDataset("gender,outcome\nMale,maybe\nMale,1\n", {
      sex: "gender",
      selected: "outcome",
    });
    expect(out.unreadableOutcomeCount).toBe(1);
  });

  it("reads a score column as a number and leaves an unreadable score null", () => {
    const out = parseDataset("gender,s\nMale,0.7\nMale,abc\nMale,\n", {
      sex: "gender",
      score: "s",
    });
    expect(out.records.map((r) => r.score)).toEqual([0.7, null, null]);
  });

  it("handles quoted fields containing commas, quotes and newlines", () => {
    const csv = 'gender,note,outcome\nMale,"a, ""b""\nc",1\n';
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.records).toHaveLength(1);
    expect(out.records[0].sex).toBe("Male");
  });

  it("handles CRLF line endings and a byte-order mark", () => {
    const out = parseDataset("﻿gender,outcome\r\nMale,1\r\nFemale,0\r\n", {
      sex: "gender",
      selected: "outcome",
    });
    expect(out.headers).toEqual(["gender", "outcome"]);
    expect(out.records).toHaveLength(2);
  });

  it("rejects an empty file with a clear message", () => {
    expect(() => parseDataset("", {})).toThrow(/no rows|empty/i);
  });

  it("rejects a header-only file", () => {
    expect(() => parseDataset("a,b,c\n", {})).toThrow(/no rows/i);
  });

  it("rejects a file whose quoted value is never closed", () => {
    expect(() => parseDataset('gender,outcome\nMale,"1\nFemale,0\n', {})).toThrow(/never closed/i);
  });

  it("counts score cells that are neither blank nor numeric", () => {
    const out = parseDataset("gender,s\nMale,0.7\nMale,abc\nMale,\n", {
      sex: "gender",
      score: "s",
    });
    expect(out.unreadableScoreCount).toBe(1);
  });
});
