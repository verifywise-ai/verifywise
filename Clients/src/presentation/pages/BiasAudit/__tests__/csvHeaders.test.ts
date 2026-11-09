import { describe, expect, it } from "vitest";
import { readCsvHeaders, splitCsvLine } from "../csvHeaders";

describe("splitCsvLine", () => {
  it("splits on commas outside quotes and unescapes doubled quotes", () => {
    expect(splitCsvLine('id,"Race, ethnicity","Say ""hi""",score')).toEqual([
      "id",
      "Race, ethnicity",
      'Say "hi"',
      "score",
    ]);
  });

  it("keeps empty fields", () => {
    expect(splitCsvLine("a,,b,")).toEqual(["a", "", "b", ""]);
  });
});

describe("readCsvHeaders", () => {
  it("reads the first line only, drops a byte order mark, trims and de-duplicates", async () => {
    const file = new File(["﻿ Sex ,Race,Sex,,selected\r\nMale,White,Male,,1\n"], "data.csv", {
      type: "text/csv",
    });
    expect(await readCsvHeaders(file)).toEqual(["Sex", "Race", "selected"]);
  });
});
