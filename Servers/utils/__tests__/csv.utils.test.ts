import { describe, it, expect } from "@jest/globals";
import { csvField, csvRow, CSV_BOM } from "../csv.utils";

describe("csv.utils", () => {
  it("renders null and undefined as an empty quoted field", () => {
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  it("doubles embedded quotes", () => {
    expect(csvField('a"b')).toBe('"a""b"');
  });

  it("keeps commas and newlines inside the quotes", () => {
    expect(csvField("x,y\nz")).toBe('"x,y\nz"');
  });

  it("prefixes formula-looking strings with a single quote", () => {
    expect(csvField("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvField("+A1")).toBe(`"'+A1"`);
    expect(csvField("-2+3")).toBe(`"'-2+3"`);
    expect(csvField("-cmd|' /C calc'!A0")).toBe(`"'-cmd|' /C calc'!A0"`);
    expect(csvField("@cmd")).toBe(`"'@cmd"`);
    expect(csvField("\tx")).toBe(`"'\tx"`);
    expect(csvField("\rx")).toBe(`"'\rx"`);
  });

  it("leaves signed numbers and a lone sign as they are", () => {
    expect(csvField("-5")).toBe('"-5"');
    expect(csvField("+1.5")).toBe('"+1.5"');
    expect(csvField("-")).toBe('"-"');
    expect(csvField("+")).toBe('"+"');
    expect(csvField("=5")).toBe(`"'=5"`);
  });

  it("does not guard numbers", () => {
    expect(csvField(-5)).toBe('"-5"');
  });

  it("renders dates as ISO strings", () => {
    expect(csvField(new Date("2026-10-11T12:00:00.000Z"))).toBe('"2026-10-11T12:00:00.000Z"');
  });

  it("ends a row with CRLF and joins fields with commas", () => {
    expect(csvRow(["a", 1, null])).toBe('"a","1",""\r\n');
  });

  it("exposes a UTF-8 BOM", () => {
    expect(CSV_BOM).toBe("\uFEFF");
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
