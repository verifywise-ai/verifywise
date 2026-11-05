/**
 * The NHTSA connector (spec D2.16, Q31): the Standing General Order crash reports as one record per
 * reporting entity and file. The fixtures are written from the schema of the files (the real header
 * has 116 columns; these hold the 32 that matter here) with fictional makers and invented values.
 * Every column that must stay out of a record carries the marker ZZPRIVATE, so that a test can prove
 * that none of them reaches one.
 */
import fs from "fs";
import path from "path";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { vrdbSourceOf } from "../../sources";
import {
  NHTSA_MAX_ROWS,
  NHTSA_MAX_UNREADABLE,
  NHTSA_RECORD_MARK,
  nhtsaConnector,
  nhtsaMonthOf,
  nhtsaSeverityOf,
  nhtsaUnreadableAllowed,
} from "../nhtsa";
import { BodyTooLargeError, type ConnectorFetch, type Snapshot } from "../types";

const readFixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const ADS = readFixture("nhtsa-ads.csv");
const ADAS = readFixture("nhtsa-adas.csv");
const OTHER = readFixture("nhtsa-other.csv");

const DOCUMENTATION_URL = vrdbSourceOf("nhtsa_sgo").documentationUrl;
const FIXED_SENTENCE =
  "The Standing General Order requires these reports; a report is not a finding of fault, and counts depend on fleet size and reporting rules.";

const snapshotOf = (ads: string, adas: string, other: string): Snapshot => ({
  bodies: [ads, adas, other],
  etag: null,
  lastModified: null,
  bytes: ads.length + adas.length + other.length,
});
const parse = (ads = ADS, adas = ADAS, other = OTHER) =>
  nhtsaConnector.parse(snapshotOf(ads, adas, other));
const recordOf = (id: string, result = parse()) =>
  result.records.find((record) => record.sourceRecordId === id);

/** The columns the connector reads; a file without one of them is not the list. */
const CORE = [
  "Report ID",
  "Report Version",
  "Reporting Entity",
  "Report Submission Date",
  "Incident Date",
  "Highest Injury Severity Alleged",
  "State",
  "Crash With",
] as const;

type Cells = Partial<Record<string, string>>;

const NONE_ALLEGED = "Property Damage. No Injured Reported";

const quote = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

/** The defaults of a report that a test does not care about. */
const defaultCell = (column: string, at: number): string => {
  switch (column) {
    case "Report ID":
      return `91000-${String(at + 1).padStart(5, "0")}`;
    case "Report Version":
      return "1";
    case "Reporting Entity":
      return "Alpha Robotics LLC";
    case "Report Submission Date":
      return "SEP-2026";
    case "Incident Date":
      return "AUG-2026";
    case "Highest Injury Severity Alleged":
      return NONE_ALLEGED;
    case "State":
      return "CA";
    case "Crash With":
      return "SUV";
    default:
      return "";
  }
};

/** A file of the given reports, with the given columns and line ending. */
function csvOf(
  rows: readonly Cells[],
  { header = [...CORE], eol = "\n" }: { header?: readonly string[]; eol?: string } = {},
): string {
  const lines = [header.map(quote).join(",")];
  rows.forEach((cells, at) => {
    lines.push(header.map((column) => quote(cells[column] ?? defaultCell(column, at))).join(","));
  });
  return `${lines.join(eol)}${eol}`;
}

/** A file with a header and no report. */
const EMPTY = csvOf([]);

/** The parse of the given reports as the ADS file, the other two files holding none. */
const parseAds = (rows: readonly Cells[], options?: Parameters<typeof csvOf>[1]) =>
  parse(csvOf(rows, options), EMPTY, EMPTY);

/** The sentence of a record text that starts with the label, whole, with its full stop. */
function sentenceOf(summary: string, label: string): string {
  const start = summary.indexOf(`${label}: `);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = summary.slice(start);
  const end = rest.search(/\. [A-Z]/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe("nhtsaMonthOf", () => {
  it.each([
    ["JAN-2026", "2026-01"],
    ["FEB-2026", "2026-02"],
    ["MAR-2026", "2026-03"],
    ["APR-2026", "2026-04"],
    ["MAY-2026", "2026-05"],
    ["JUN-2026", "2026-06"],
    ["JUL-2026", "2026-07"],
    ["AUG-2026", "2026-08"],
    ["SEP-2026", "2026-09"],
    ["OCT-2026", "2026-10"],
    ["NOV-2026", "2026-11"],
    ["DEC-2026", "2026-12"],
  ])("reads %s as the month %s", (text, month) => {
    expect(nhtsaMonthOf(text)).toBe(month);
  });

  it("reads the year as written, and tolerates case and white space around the text", () => {
    expect(nhtsaMonthOf("AUG-2021")).toBe("2021-08");
    expect(nhtsaMonthOf("Aug-2026")).toBe("2026-08");
    expect(nhtsaMonthOf(" aug-2026\t")).toBe("2026-08");
  });

  it.each([
    "",
    " ",
    "ABC-2026",
    "AUGUST-2026",
    "SEPT-2026",
    "AUG-26",
    "AUG-20260",
    "AUG 2026",
    "AUG/2026",
    "AUG-2026-01",
    "2026-08",
    "08-2026",
    "13-2026",
    "15-AUG-2026",
    "AUG-1999",
    "AUG-0000",
    "AUG-2100",
    "Y",
    "Unknown",
  ])("gives no month for %j", (text) => {
    expect(nhtsaMonthOf(text)).toBeNull();
  });
});

describe("nhtsaSeverityOf", () => {
  it.each([
    ["Fatality", "fatality"],
    ["Serious W/ Hospitalization", "serious"],
    ["Serious W/O Hospitalization", "serious"],
    ["Moderate W/ Hospitalization", "moderate"],
    ["Moderate W/O Hospitalization", "moderate"],
    ["Minor W/ Hospitalization", "minor"],
    ["Minor W/O Hospitalization", "minor"],
    ["No Injured Reported", "none"],
    ["Property Damage. No Injured Reported", "none"],
    ["Unknown", "unknown"],
  ])("puts %j in the bucket %s", (text, bucket) => {
    expect(nhtsaSeverityOf(text)).toBe(bucket);
  });

  it("tolerates case and white space, and puts anything else, and nothing, in unknown", () => {
    expect(nhtsaSeverityOf("  FATALITY ")).toBe("fatality");
    expect(nhtsaSeverityOf("serious w/ hospitalization")).toBe("serious");
    expect(nhtsaSeverityOf("property damage. no injured reported")).toBe("none");
    expect(nhtsaSeverityOf("")).toBe("unknown");
    expect(nhtsaSeverityOf("Injured, severity not stated")).toBe("unknown");
    expect(nhtsaSeverityOf("Fatal injury")).toBe("unknown");
    expect(nhtsaSeverityOf("No injury")).toBe("unknown");
  });
});

describe("nhtsaUnreadableAllowed", () => {
  it("is ten, or a hundredth of the rows when that is more", () => {
    expect(NHTSA_MAX_UNREADABLE).toBe(10);
    expect(nhtsaUnreadableAllowed(0)).toBe(10);
    expect(nhtsaUnreadableAllowed(1000)).toBe(10);
    expect(nhtsaUnreadableAllowed(1099)).toBe(10);
    expect(nhtsaUnreadableAllowed(1100)).toBe(11);
    expect(nhtsaUnreadableAllowed(2000)).toBe(20);
    expect(nhtsaUnreadableAllowed(2099)).toBe(20);
  });
});

describe("nhtsaConnector.parse of the fixtures", () => {
  it("gives one record per reporting entity and file, in the order of the files", () => {
    const { records, errors, skipped, root } = parse();

    expect(errors).toBe(0);
    expect(skipped).toBe(0);
    expect(root).not.toBeNull();
    expect(records.map((record) => record.sourceRecordId)).toEqual([
      "alpharoboticsllc:ads",
      "brightlinemobilityinc:ads",
      "alpharoboticsllc:adas",
      "cobaltdriveinc:adas",
      "harbormotorsharbormotorcompanyofamerica:adas",
      "brightlinemobilityinc:other",
    ]);
    expect(new Set(records.map((record) => record.recordType))).toEqual(
      new Set(["crash_report_summary"]),
    );
  });

  it("reads the record of an entity word for word", () => {
    expect(recordOf("alpharoboticsllc:ads")).toEqual({
      sourceRecordId: "alpharoboticsllc:ads",
      recordType: "crash_report_summary",
      title: "NHTSA crash reports: Alpha Robotics LLC (Automated Driving System)",
      summary:
        "NHTSA Standing General Order crash reports (nhtsa.gov). " +
        "Reporting entity: Alpha Robotics LLC. " +
        "Automation: Automated Driving System. " +
        "Crash reports in NHTSA's current files (Aug 2025 to Mar 2026): 7. " +
        "Highest injury severity alleged: fatality 1, serious 1, moderate 0, minor 2, no injury or property damage only 2, unknown 1. " +
        "Reports by year of the incident: 2025: 3, 2026: 4. " +
        "Newest reports: 90001-00010, Mar 2026, NV, crash with Animal, minor injury; " +
        "90001-00006, Mar 2026, CA, crash with Van, injury unknown; " +
        "90001-00005, Mar 2026, CA, crash with Bus, fatality. " +
        FIXED_SENTENCE,
      url: `${DOCUMENTATION_URL}?reportingEntity=alpharoboticsllc&automation=ads`,
      identifiers: { reportingEntity: "Alpha Robotics LLC", automation: "ads", reports: 7 },
      matchKeys: ["name:alpharoboticsllc", "name:alpharobotics"],
      publishedAt: "2026-03-01",
      sourceUpdatedAt: null,
    });
  });

  it("names the automation of each file, and keeps one entity of two files as two records", () => {
    const ads = recordOf("alpharoboticsllc:ads");
    const adas = recordOf("alpharoboticsllc:adas");
    const brightAds = recordOf("brightlinemobilityinc:ads");
    const brightOther = recordOf("brightlinemobilityinc:other");

    expect(ads?.title).toBe("NHTSA crash reports: Alpha Robotics LLC (Automated Driving System)");
    expect(adas?.title).toBe("NHTSA crash reports: Alpha Robotics LLC (Level 2 driver assistance)");
    expect(brightAds?.title).toBe(
      "NHTSA crash reports: Brightline Mobility, Inc. (Automated Driving System)",
    );
    expect(brightOther?.title).toBe(
      "NHTSA crash reports: Brightline Mobility, Inc. (automation not identified)",
    );
    expect(adas?.summary).toContain("Automation: Level 2 driver assistance.");
    expect(brightOther?.summary).toContain("Automation: automation not identified.");
    expect(adas?.identifiers).toEqual({
      reportingEntity: "Alpha Robotics LLC",
      automation: "adas",
      reports: 1,
    });
    expect(brightOther?.identifiers).toEqual({
      reportingEntity: "Brightline Mobility, Inc.",
      automation: "other",
      reports: 1,
    });
  });

  it("counts a report once, at its highest version, wherever the file lists it", () => {
    // 90001-00003 is listed as version 2 (serious) and then version 1 (moderate).
    const text = recordOf("alpharoboticsllc:ads")?.summary ?? "";

    expect(text).toContain("fatality 1, serious 1, moderate 0, minor 2");
    expect(text).toContain("): 7.");
  });

  it("reads the record of an entity with a parenthesis in its name and a state that is empty", () => {
    const text = recordOf("harbormotorsharbormotorcompanyofamerica:adas")?.summary ?? "";

    expect(text).toBe(
      "NHTSA Standing General Order crash reports (nhtsa.gov). " +
        "Reporting entity: Harbor Motors (Harbor Motor Company of America). " +
        "Automation: Level 2 driver assistance. " +
        "Crash reports in NHTSA's current files (Jun 2025 to Jul 2025): 2. " +
        "Highest injury severity alleged: fatality 0, serious 1, moderate 1, minor 0, no injury or property damage only 0, unknown 0. " +
        "Reports by year of the incident: 2025: 2. " +
        // The state of the first is empty, and is left out.
        "Newest reports: 90003-00002, Jul 2025, UNK, crash with Other, see Narrative, moderate injury; " +
        "90003-00001, Jun 2025, crash with SUV, serious injury. " +
        FIXED_SENTENCE,
    );
  });

  it("names a single month once", () => {
    expect(recordOf("brightlinemobilityinc:other")?.summary).toContain(
      "Crash reports in NHTSA's current files (May 2026): 1.",
    );
  });

  it("takes publishedAt from the newest incident month", () => {
    const result = parse();

    expect(recordOf("alpharoboticsllc:ads", result)?.publishedAt).toBe("2026-03-01");
    expect(recordOf("brightlinemobilityinc:ads", result)?.publishedAt).toBe("2025-11-01");
    expect(recordOf("alpharoboticsllc:adas", result)?.publishedAt).toBe("2026-01-01");
    expect(recordOf("cobaltdriveinc:adas", result)?.publishedAt).toBe("2026-04-01");
    expect(recordOf("brightlinemobilityinc:other", result)?.publishedAt).toBe("2026-05-01");
  });

  it("takes the version of the list from the newest submission month of any file", () => {
    expect(parse().sourceVersion).toBe("2026-06");
    expect(parse(ADS, EMPTY, EMPTY).sourceVersion).toBe("2026-05");
  });

  it("matches by the name of the entity as written and without its legal form", () => {
    expect(recordOf("brightlinemobilityinc:ads")?.matchKeys).toEqual([
      "name:brightlinemobilityinc",
      "name:brightlinemobility",
    ]);
    expect(recordOf("cobaltdriveinc:adas")?.matchKeys).toEqual([
      "name:cobaltdriveinc",
      "name:cobaltdrive",
    ]);
  });

  it("matches by the text before the parenthesis and the text inside it, besides the whole name", () => {
    expect(recordOf("harbormotorsharbormotorcompanyofamerica:adas")?.matchKeys).toEqual([
      "name:harbormotorsharbormotorcompanyofamerica",
      "name:harbormotors",
      "name:harbormotorcompanyofamerica",
    ]);
  });

  it("keeps every other column out of a record, the identifiers and the keys included", () => {
    const result = parse();
    const everything = JSON.stringify(result);

    expect(result.records).toHaveLength(6);
    expect(everything).not.toMatch(/zzprivate/i);
    expect(everything).not.toMatch(/narrative, first line|second line|quoted|nowhere/i);
    for (const record of result.records) {
      expect(Object.keys(record.identifiers).sort()).toEqual([
        "automation",
        "reportingEntity",
        "reports",
      ]);
      expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
    }
  });

  it("gives every record an address and an id of its own", () => {
    const { records } = parse();

    expect(new Set(records.map((record) => record.url)).size).toBe(records.length);
    expect(new Set(records.map((record) => record.sourceRecordId)).size).toBe(records.length);
    expect(records.map((record) => record.url)).toEqual([
      `${DOCUMENTATION_URL}?reportingEntity=alpharoboticsllc&automation=ads`,
      `${DOCUMENTATION_URL}?reportingEntity=brightlinemobilityinc&automation=ads`,
      `${DOCUMENTATION_URL}?reportingEntity=alpharoboticsllc&automation=adas`,
      `${DOCUMENTATION_URL}?reportingEntity=cobaltdriveinc&automation=adas`,
      `${DOCUMENTATION_URL}?reportingEntity=harbormotorsharbormotorcompanyofamerica&automation=adas`,
      `${DOCUMENTATION_URL}?reportingEntity=brightlinemobilityinc&automation=other`,
    ]);
  });

  it("begins every text with the mark and ends it with the sentence that says a report is no finding of fault", () => {
    for (const record of parse().records) {
      expect(record.summary.startsWith(`${NHTSA_RECORD_MARK} (nhtsa.gov). `)).toBe(true);
      expect(record.summary.endsWith(FIXED_SENTENCE)).toBe(true);
      expect(record.summary).not.toMatch(/As of|Lookup note/);
    }
  });

  it("gives the same records for the same reports in any order", () => {
    // A row of a fixture starts at a report id; the narrative of a row goes on over several lines.
    const reversedRows = (text: string): string => {
      const [header, ...rows] = text.trimEnd().split(/\n(?=\d{5}-\d{5},)/);
      return `${header}\n${rows.reverse().join("\n")}\n`;
    };

    expect(parse(reversedRows(ADS), reversedRows(ADAS), reversedRows(OTHER))).toEqual(parse());
  });
});

describe("nhtsaConnector.parse, the file", () => {
  it("reads quoted fields that hold commas, quotes and line breaks, with any line ending", () => {
    const narrative = 'NARRATIVEMARK first line, with a comma\r\nsecond "quoted" line\nthird line';
    const rows = [{ State: "CA" }, { State: "TX" }];
    const header = [...CORE, "Narrative"];
    const reference = parseAds(rows, { header: [...CORE] });

    for (const eol of ["\n", "\r\n"]) {
      const result = parseAds(
        rows.map((cells) => ({ ...cells, Narrative: narrative })),
        { header, eol },
      );

      expect(result.errors).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.records).toEqual(reference.records);
      expect(result.records[0].summary).toContain("): 2.");
      expect(JSON.stringify(result.records)).not.toContain("NARRATIVEMARK");
    }
  });

  it("drops a byte order mark in front of the first column, quoted or not", () => {
    const mark = String.fromCharCode(0xfeff);
    const plain = parse(`${mark}${csvOf([{}])}`, EMPTY, EMPTY);
    const quoted = parse(`${mark}${csvOf([{}]).replace("Report ID", '"Report ID"')}`, EMPTY, EMPTY);

    for (const result of [plain, quoted]) {
      expect(result.root).not.toBeNull();
      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(1);
    }
  });

  it("finds the columns by name, whatever their order or the columns around them", () => {
    const header = [
      "Zeta",
      "Highest Injury Severity Alleged",
      "Crash With",
      "State",
      "Incident Date",
      "Reporting Entity",
      "Report Submission Date",
      "Report Version",
      "Report ID",
      "Omega",
    ];
    const reference = parseAds([{ State: "TX", "Crash With": "Bus" }]);

    const shuffled = parseAds([{ State: "TX", "Crash With": "Bus", Zeta: "x", Omega: "y" }], {
      header,
    });

    expect(shuffled).toEqual(reference);
  });

  it.each(CORE)("gives no root for a file without the column %s", (column) => {
    const header = CORE.filter((name) => name !== column);

    for (const position of [0, 1, 2]) {
      const files = [csvOf([{}]), csvOf([{}]), csvOf([{}])];
      files[position] = csvOf([{}], { header });

      const result = parse(files[0], files[1], files[2]);

      expect(result.root).toBeNull();
      expect(result.records).toEqual([]);
      expect(result.errors).toBeGreaterThan(0);
    }
  });

  it("gives no root for a file that is not the list, an empty one, or a missing one", () => {
    expect(parse("<html><body>Maintenance</body></html>", EMPTY, EMPTY).root).toBeNull();
    expect(parse("", EMPTY, EMPTY).root).toBeNull();
    expect(parse(EMPTY, "   \n", EMPTY).root).toBeNull();
    expect(
      nhtsaConnector.parse({ bodies: [EMPTY, EMPTY], etag: null, lastModified: null, bytes: 0 })
        .root,
    ).toBeNull();
  });

  it("reads a file at the row limit and gives no root for one with a row more", () => {
    const rowsOf = (count: number): Cells[] => Array.from({ length: count }, () => ({}));

    const atLimit = parse(csvOf(rowsOf(NHTSA_MAX_ROWS)), EMPTY, EMPTY);
    const over = parse(csvOf(rowsOf(NHTSA_MAX_ROWS + 1)), EMPTY, EMPTY);

    expect(atLimit.root).not.toBeNull();
    expect(atLimit.errors).toBe(0);
    expect(atLimit.records[0].identifiers).toMatchObject({ reports: NHTSA_MAX_ROWS });
    expect(over.root).toBeNull();
    expect(over.records).toEqual([]);
    expect(over.errors).toBeGreaterThan(0);
  });

  it("gives a root and no record for files that hold a header and no report", () => {
    const result = parse(EMPTY, EMPTY, EMPTY);

    expect(result).toMatchObject({ records: [], errors: 0, sourceVersion: null });
    expect(result.root).not.toBeNull();
  });

  it("ignores blank lines and rows that hold nothing but white space", () => {
    const text = csvOf([{}, {}]).replace(/\n/g, "\n\n") + "   \n\t\n";

    const result = parse(text, EMPTY, EMPTY);

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.records[0].identifiers).toMatchObject({ reports: 2 });
  });

  it("counts a file cut inside a quoted field as an error, and still reads the rows before it", () => {
    const result = parse(`${csvOf([{}, {}])}91000-99999,1,"Alpha Rob`, EMPTY, EMPTY);

    expect(result.errors).toBe(1);
    expect(result.root).not.toBeNull();
    expect(result.records[0].identifiers).toMatchObject({ reports: 2 });
  });
});

describe("nhtsaConnector.parse, the reports of a group", () => {
  it("keeps the highest version of a report, in any order, comparing versions as numbers", () => {
    const rows = [
      {
        "Report ID": "91000-00001",
        "Report Version": "1",
        "Highest Injury Severity Alleged": "Fatality",
      },
      {
        "Report ID": "91000-00001",
        "Report Version": "3",
        "Highest Injury Severity Alleged": "Minor W/O Hospitalization",
      },
      {
        "Report ID": "91000-00001",
        "Report Version": "2",
        "Highest Injury Severity Alleged": "Serious W/ Hospitalization",
      },
      {
        "Report ID": "91000-00002",
        "Report Version": "2",
        "Highest Injury Severity Alleged": "Moderate W/ Hospitalization",
      },
      {
        "Report ID": "91000-00002",
        "Report Version": "2",
        "Highest Injury Severity Alleged": "Fatality",
      },
      {
        "Report ID": "91000-00002",
        "Report Version": "10",
        "Highest Injury Severity Alleged": "Unknown",
      },
      {
        "Report ID": "91000-00003",
        "Report Version": "9",
        "Highest Injury Severity Alleged": "Fatality",
      },
    ];

    const text = parseAds(rows).records[0].summary;

    // 00001 at version 3 (minor), 00002 at version 10 (unknown), 00003 at version 9 (fatality).
    expect(text).toContain("): 3.");
    expect(text).toContain(
      "Highest injury severity alleged: fatality 1, serious 0, moderate 0, minor 1, no injury or property damage only 0, unknown 1.",
    );
  });

  it("keeps the first of two reports of one version", () => {
    const rows = [
      {
        "Report ID": "91000-00001",
        "Report Version": "2",
        "Highest Injury Severity Alleged": "Fatality",
      },
      {
        "Report ID": "91000-00001",
        "Report Version": "2",
        "Highest Injury Severity Alleged": "Unknown",
      },
    ];

    expect(parseAds(rows).records[0].summary).toContain(
      "fatality 1, serious 0, moderate 0, minor 0",
    );
  });

  it("counts a report that two files hold once, in the file of its highest version, else the first", () => {
    const report = (version: string): string =>
      csvOf([
        { "Report ID": "91000-00001", "Report Version": version, "Reporting Entity": "Delta" },
      ]);
    const idsOf = (result: ReturnType<typeof parse>) =>
      result.records.map((record) => record.sourceRecordId);

    expect(idsOf(parse(report("2"), report("1"), EMPTY))).toEqual(["delta:ads"]);
    expect(idsOf(parse(report("1"), report("2"), EMPTY))).toEqual(["delta:adas"]);
    expect(idsOf(parse(EMPTY, report("1"), report("3")))).toEqual(["delta:other"]);
    // The same version in two files: the first file in the order ADS, ADAS, OTHER keeps it.
    expect(idsOf(parse(EMPTY, report("2"), report("2")))).toEqual(["delta:adas"]);
  });

  it.each([
    [
      "Fatality",
      "fatality 1, serious 0, moderate 0, minor 0, no injury or property damage only 0, unknown 0",
    ],
    [
      "Serious W/ Hospitalization",
      "fatality 0, serious 1, moderate 0, minor 0, no injury or property damage only 0, unknown 0",
    ],
    [
      "Serious W/O Hospitalization",
      "fatality 0, serious 1, moderate 0, minor 0, no injury or property damage only 0, unknown 0",
    ],
    [
      "Moderate W/ Hospitalization",
      "fatality 0, serious 0, moderate 1, minor 0, no injury or property damage only 0, unknown 0",
    ],
    [
      "Moderate W/O Hospitalization",
      "fatality 0, serious 0, moderate 1, minor 0, no injury or property damage only 0, unknown 0",
    ],
    [
      "Minor W/ Hospitalization",
      "fatality 0, serious 0, moderate 0, minor 1, no injury or property damage only 0, unknown 0",
    ],
    [
      "Minor W/O Hospitalization",
      "fatality 0, serious 0, moderate 0, minor 1, no injury or property damage only 0, unknown 0",
    ],
    [
      "No Injured Reported",
      "fatality 0, serious 0, moderate 0, minor 0, no injury or property damage only 1, unknown 0",
    ],
    [
      NONE_ALLEGED,
      "fatality 0, serious 0, moderate 0, minor 0, no injury or property damage only 1, unknown 0",
    ],
    [
      "Unknown",
      "fatality 0, serious 0, moderate 0, minor 0, no injury or property damage only 0, unknown 1",
    ],
    [
      "",
      "fatality 0, serious 0, moderate 0, minor 0, no injury or property damage only 0, unknown 1",
    ],
    [
      "A value NHTSA adds later",
      "fatality 0, serious 0, moderate 0, minor 0, no injury or property damage only 0, unknown 1",
    ],
  ])("counts the severity %j in its bucket", (severity, counts) => {
    const record = parseAds([{ "Highest Injury Severity Alleged": severity }]).records[0];

    expect(record.summary).toContain(`Highest injury severity alleged: ${counts}.`);
  });

  it("counts the reports by the year of the incident, oldest year first", () => {
    const incidents = [
      "DEC-2026",
      "JAN-2024",
      "JUN-2025",
      "MAR-2026",
      "DEC-2024",
      "JAN-2024",
      "JUL-2026",
    ];

    const text = parseAds(incidents.map((month) => ({ "Incident Date": month }))).records[0]
      .summary;

    expect(sentenceOf(text, "Reports by year of the incident")).toBe(
      "Reports by year of the incident: 2024: 3, 2025: 1, 2026: 3.",
    );
    expect(text).toContain("(Jan 2024 to Dec 2026): 7.");
  });

  it("shows the three newest reports: by incident month, then submission month, then report id", () => {
    const rows = [
      {
        "Report ID": "91000-00009",
        "Incident Date": "MAR-2026",
        "Report Submission Date": "APR-2026",
        State: "S1",
      },
      {
        "Report ID": "91000-00010",
        "Incident Date": "MAR-2026",
        "Report Submission Date": "APR-2026",
        State: "S2",
      },
      {
        "Report ID": "91000-00002",
        "Incident Date": "MAR-2026",
        "Report Submission Date": "MAY-2026",
        State: "S3",
      },
      {
        "Report ID": "91000-00001",
        "Incident Date": "JUN-2026",
        "Report Submission Date": "JUL-2026",
        State: "S4",
      },
      {
        "Report ID": "91000-00003",
        "Incident Date": "FEB-2026",
        "Report Submission Date": "AUG-2026",
        State: "S5",
      },
      {
        "Report ID": "91000-00004",
        "Incident Date": "JAN-2025",
        "Report Submission Date": "FEB-2025",
        State: "S6",
      },
    ];

    const text = sentenceOf(parseAds(rows).records[0].summary, "Newest reports");

    expect(
      text.split("; ").map((item) => item.split(", ")[0].replace("Newest reports: ", "")),
    ).toEqual(["91000-00001", "91000-00002", "91000-00010"]);
    expect(text).toContain(
      "91000-00001, Jun 2026, S4, crash with SUV, no injury or property damage only;",
    );
    for (const left of ["S1", "S5", "S6"]) expect(text).not.toContain(left);
  });

  it("shows fewer than three newest reports when there are fewer", () => {
    const text = parseAds([{}, {}]).records[0].summary;

    expect(sentenceOf(text, "Newest reports").split("; ")).toHaveLength(2);
  });

  it("orders report ids as numbers where their digits differ in length", () => {
    const rows = [
      { "Report ID": "91000-9", "Incident Date": "MAR-2026" },
      { "Report ID": "91000-10", "Incident Date": "MAR-2026" },
      { "Report ID": "91000-100", "Incident Date": "MAR-2026" },
      { "Report ID": "91000-99", "Incident Date": "MAR-2026" },
    ];

    const text = sentenceOf(parseAds(rows).records[0].summary, "Newest reports");

    expect(text.match(/91000-\d+/g)).toEqual(["91000-100", "91000-99", "91000-10"]);
  });

  it("leaves out of a report line the state and the crash partner that the file leaves empty", () => {
    const text = parseAds([{ State: "", "Crash With": "" }]).records[0].summary;

    expect(sentenceOf(text, "Newest reports")).toBe(
      "Newest reports: 91000-00001, Aug 2026, no injury or property damage only.",
    );
  });

  it("names a fatality, and each injury with its severity", () => {
    const rows = [
      {
        "Report ID": "91000-00001",
        "Highest Injury Severity Alleged": "Fatality",
        "Incident Date": "JAN-2026",
      },
      {
        "Report ID": "91000-00002",
        "Highest Injury Severity Alleged": "Serious W/O Hospitalization",
        "Incident Date": "FEB-2026",
      },
      {
        "Report ID": "91000-00003",
        "Highest Injury Severity Alleged": "Moderate W/ Hospitalization",
        "Incident Date": "MAR-2026",
      },
    ];

    const text = sentenceOf(parseAds(rows).records[0].summary, "Newest reports");

    expect(text).toContain("Mar 2026, CA, crash with SUV, moderate injury;");
    expect(text).toContain("Feb 2026, CA, crash with SUV, serious injury;");
    expect(text).toContain("Jan 2026, CA, crash with SUV, fatality.");
  });

  it("counts a report with no incident month in the total and its severity, and in no list of dates", () => {
    const rows = [
      { "Report ID": "91000-00001", "Incident Date": "MAR-2026" },
      {
        "Report ID": "91000-00002",
        "Incident Date": "",
        "Incident Date - Unknown": "Y",
        "Highest Injury Severity Alleged": "Fatality",
      },
      {
        "Report ID": "91000-00003",
        "Incident Date": " ",
        "Incident Date - Unknown": "Y",
        "Highest Injury Severity Alleged": "Unknown",
      },
    ];

    const result = parseAds(rows, { header: [...CORE, "Incident Date - Unknown"] });
    const record = result.records[0];

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(record.identifiers).toMatchObject({ reports: 3 });
    expect(record.summary).toContain("(Mar 2026): 3.");
    expect(record.summary).toContain(
      "fatality 1, serious 0, moderate 0, minor 0, no injury or property damage only 1, unknown 1.",
    );
    expect(record.summary).toContain("Reports by year of the incident: 2026: 1.");
    expect(sentenceOf(record.summary, "Newest reports").split("; ")).toHaveLength(1);
    expect(record.summary).not.toContain("91000-00002");
    expect(record.publishedAt).toBe("2026-03-01");
  });

  it("counts a report whose date is flagged unknown without a month, whatever the cell holds", () => {
    const header = [...CORE, "Incident Date - Unknown"];
    const rows = [
      { "Report ID": "91000-00001", "Incident Date": "MAR-2026" },
      { "Report ID": "91000-00002", "Incident Date": "UNK", "Incident Date - Unknown": "Y" },
      { "Report ID": "91000-00003", "Incident Date": "Unknown", "Incident Date - Unknown": " y " },
    ];

    const result = parseAds(rows, { header });

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.records[0].identifiers).toMatchObject({ reports: 3 });
    expect(result.records[0].summary).toContain("Reports by year of the incident: 2026: 1.");
    expect(result.records[0].summary).not.toContain("91000-00002");
  });

  it("uses a month that is there, though the date is flagged unknown", () => {
    const header = [...CORE, "Incident Date - Unknown"];

    const [record] = parseAds([{ "Incident Date": "MAR-2026", "Incident Date - Unknown": "Y" }], {
      header,
    }).records;

    expect(record.publishedAt).toBe("2026-03-01");
    expect(record.summary).toContain("Reports by year of the incident: 2026: 1.");
  });

  it("skips a date that is no month and that the file does not flag as unknown", () => {
    const header = [...CORE, "Incident Date - Unknown"];

    for (const flag of [" ", "", "N"]) {
      const result = parseAds(
        [
          { "Report ID": "91000-00001" },
          { "Incident Date": "UNK", "Incident Date - Unknown": flag },
        ],
        { header },
      );

      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.records[0].identifiers).toMatchObject({ reports: 1 });
    }
  });

  it("gives a group of reports with no incident month no day, no range and no list of dates", () => {
    const result = parseAds([{ "Incident Date": "" }]);
    const record = result.records[0];

    expect(result.errors).toBe(0);
    expect(record.publishedAt).toBeNull();
    expect(record.summary).toContain("Crash reports in NHTSA's current files: 1.");
    expect(record.summary).not.toMatch(/Reports by year|Newest reports/);
    expect(record.summary.endsWith(FIXED_SENTENCE)).toBe(true);
  });

  it("titles a group by its most frequent spelling, and merges spellings of one compact name", () => {
    // "Delta Drive Inc" sorts before "Delta Drive, Inc.", so only the count can choose the second.
    const rows = [
      { "Reporting Entity": "Delta Drive Inc" },
      { "Reporting Entity": "Delta Drive, Inc." },
      { "Reporting Entity": "Delta Drive, Inc." },
      { "Reporting Entity": " Delta  Drive,  Inc. " },
    ];

    const { records } = parseAds(rows);

    expect(records).toHaveLength(1);
    expect(records[0].sourceRecordId).toBe("deltadriveinc:ads");
    expect(records[0].title).toBe(
      "NHTSA crash reports: Delta Drive, Inc. (Automated Driving System)",
    );
    expect(records[0].identifiers).toEqual({
      reportingEntity: "Delta Drive, Inc.",
      automation: "ads",
      reports: 4,
    });
    expect(records[0].matchKeys).toEqual(["name:deltadriveinc", "name:deltadrive"]);
  });

  it("titles a tie of spellings by the one that sorts first, so that the order of the rows decides nothing", () => {
    const one = parseAds([
      { "Reporting Entity": "Delta Drive, Inc." },
      { "Reporting Entity": "Delta Drive Inc" },
    ]);
    const other = parseAds([
      { "Reporting Entity": "Delta Drive Inc" },
      { "Reporting Entity": "Delta Drive, Inc." },
    ]);

    expect(one.records[0].title).toBe(other.records[0].title);
    expect(one.records[0].title).toBe(
      "NHTSA crash reports: Delta Drive Inc (Automated Driving System)",
    );
  });

  it("takes the entity as written, except for the white space around and inside it", () => {
    const { records } = parseAds([{ "Reporting Entity": "  Cobalt \t Drive,\n Inc.  " }]);

    expect(records[0].title).toBe(
      "NHTSA crash reports: Cobalt Drive, Inc. (Automated Driving System)",
    );
    expect(records[0].summary).toContain("Reporting entity: Cobalt Drive, Inc. Automation:");
  });

  it("reads a name that holds the replacement character of a byte that was not UTF-8", () => {
    const name = `Caf${String.fromCharCode(0xfffd)} Motors LLC`;

    const [record] = parseAds([{ "Reporting Entity": name }]).records;

    expect(record.sourceRecordId).toBe("cafmotorsllc:ads");
    expect(record.matchKeys).toEqual(["name:cafmotorsllc", "name:cafmotors"]);
    expect(record.title).toContain(name);
  });

  it("adds no key for the make, the operating entity or any other column", () => {
    const header = [...CORE, "Make", "Model", "Operating Entity"];
    const rows = [
      { Make: "Marquee", Model: "Zephyr", "Operating Entity": "Gamma Fleet Services LLC" },
    ];

    const { records } = parseAds(rows, { header });

    expect(records[0].matchKeys).toEqual(["name:alpharoboticsllc", "name:alpharobotics"]);
    expect(JSON.stringify(records)).not.toMatch(/marquee|zephyr|gamma/i);
  });

  it("reads the text inside a parenthesis that is never closed, and ignores an empty one", () => {
    const open = parseAds([{ "Reporting Entity": "Epsilon Cars (Epsilon Holding Group" }]);
    const empty = parseAds([{ "Reporting Entity": "Epsilon Cars ()" }]);

    expect(open.records[0].matchKeys).toEqual([
      "name:epsiloncarsepsilonholdinggroup",
      "name:epsiloncars",
      "name:epsilonholdinggroup",
    ]);
    expect(empty.records[0].matchKeys).toEqual(["name:epsiloncars"]);
  });

  it("gives no key for a name of fewer than four letters and digits", () => {
    const { records } = parseAds([{ "Reporting Entity": "GM (General Motors, LLC)" }]);

    expect(records[0].matchKeys).toEqual([
      "name:gmgeneralmotorsllc",
      "name:generalmotorsllc",
      "name:generalmotors",
    ]);
    expect(records[0].matchKeys).not.toContain("name:gm");
  });

  it("keeps the id and the address of an entity with a very long name within their limits", () => {
    const long = `Zeta ${"Very Long Company Name ".repeat(400)}Inc`;

    const [record] = parseAds([{ "Reporting Entity": long }]).records;

    expect(record.sourceRecordId.length).toBeLessThanOrEqual(200);
    expect(record.sourceRecordId.endsWith(":ads")).toBe(true);
    expect(record.title.length).toBeLessThan(400);
    expect(record.url.length).toBeLessThan(DOCUMENTATION_URL.length + 300);
  });

  it("does not cut a name inside a character of more than one code unit", () => {
    const astral = String.fromCodePoint(0x1d4d0);
    const name = `A${astral.repeat(170)} Motors`;

    const [record] = parseAds([{ "Reporting Entity": name }]).records;
    const key = record.sourceRecordId.slice(0, -":ads".length);

    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(key).not.toMatch(/(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});

describe("nhtsaConnector.parse, the rows it cannot read", () => {
  /** A file of 100 reports and the given extra rows; `skipped` and `errors` of its parse. */
  const countsOf = (extra: readonly Cells[]) => {
    const good = Array.from({ length: 100 }, () => ({}) as Cells);
    const result = parseAds([...good, ...extra]);
    return { skipped: result.skipped, errors: result.errors, records: result.records };
  };

  it.each([
    ["no report id", { "Report ID": "" }],
    ["a report id of white space", { "Report ID": "  " }],
    ["a report id with a space in it", { "Report ID": "91000 99999" }],
    ["a report id with markup in it", { "Report ID": "<x>" }],
    ["a report id that is too long", { "Report ID": `91000-${"9".repeat(60)}` }],
    ["no reporting entity", { "Reporting Entity": "" }],
    ["a reporting entity of white space", { "Reporting Entity": " \t " }],
    ["a reporting entity with no letter or digit", { "Reporting Entity": "---" }],
    ["no version", { "Report Version": "" }],
    ["a version that is no number", { "Report Version": "one" }],
    ["a negative version", { "Report Version": "-1" }],
    ["a month that does not exist", { "Incident Date": "XXX-2026" }],
    ["a day instead of a month", { "Incident Date": "2026-08-15" }],
    ["a month with a two digit year", { "Incident Date": "AUG-26" }],
  ] as Array<[string, Cells]>)("skips and counts a row with %s", (_name, cells) => {
    const { skipped, errors, records } = countsOf([{ "Report ID": "91999-00001", ...cells }]);

    expect(skipped).toBe(1);
    expect(errors).toBe(0);
    expect(records[0].identifiers).toMatchObject({ reports: 100 });
  });

  it("skips and counts a row with more or fewer cells than the header", () => {
    const text = csvOf(Array.from({ length: 100 }, () => ({}) as Cells));
    const [, first] = text.split("\n");

    const longer = parse(`${text}${first},extra\n`, EMPTY, EMPTY);
    const shorter = parse(`${text}${first.split(",").slice(0, -1).join(",")}\n`, EMPTY, EMPTY);

    for (const result of [longer, shorter]) {
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.records[0].identifiers).toMatchObject({ reports: 100 });
    }
  });

  it("does not skip a report whose state, crash partner or severity is empty", () => {
    const { skipped, errors, records } = countsOf([
      {
        "Report ID": "91999-00001",
        State: "",
        "Crash With": "",
        "Highest Injury Severity Alleged": "",
      },
    ]);

    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    expect(records[0].identifiers).toMatchObject({ reports: 101 });
  });

  it("does not skip a report whose submission month it cannot read", () => {
    const { skipped, errors, records } = countsOf([
      { "Report ID": "91999-00001", "Report Submission Date": "" },
      { "Report ID": "91999-00002", "Report Submission Date": "sometime" },
    ]);

    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    expect(records[0].identifiers).toMatchObject({ reports: 102 });
  });

  it("gives no version of the list when no submission month can be read", () => {
    const result = parseAds([
      { "Report Submission Date": "" },
      { "Report Submission Date": "soon" },
    ]);

    expect(result.sourceVersion).toBeNull();
    expect(result.errors).toBe(0);
  });

  it("tolerates ten unreadable rows, or a hundredth of the rows, as skipped", () => {
    const bad = (count: number) =>
      Array.from({ length: count }, (_, at) => ({
        "Report ID": `91999-${String(at).padStart(5, "0")}`,
        "Reporting Entity": "",
      }));

    // 100 + 10 rows: ten are within the ten that are always tolerated.
    expect(countsOf(bad(10))).toMatchObject({ skipped: 10, errors: 0 });

    // 2,000 rows: a hundredth is 20.
    const many = (extra: number) => {
      const good = Array.from({ length: 2000 - extra }, () => ({}) as Cells);
      return parseAds([...good, ...bad(extra)]);
    };
    expect(many(20)).toMatchObject({ skipped: 20, errors: 0 });
    expect(many(20).records).toHaveLength(1);
  });

  it("reports the unreadable rows as errors, and skips none, above that", () => {
    const bad = (count: number) =>
      Array.from({ length: count }, (_, at) => ({
        "Report ID": `91999-${String(at).padStart(5, "0")}`,
        "Reporting Entity": "",
      }));

    expect(countsOf(bad(11))).toMatchObject({ skipped: 0, errors: 11 });

    const good = Array.from({ length: 2000 - 21 }, () => ({}) as Cells);
    const result = parseAds([...good, ...bad(21)]);

    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(21);
  });

  it("counts the rows of all three files toward the hundredth", () => {
    const rows = (count: number, entity: string) =>
      Array.from({ length: count }, (_, at) => ({
        "Report ID": `${entity}-${at}`,
        "Reporting Entity": entity,
      }));
    const bad = Array.from({ length: 15 }, (_, at) => ({
      "Report ID": `92000-${at}`,
      "Reporting Entity": "",
    }));

    const result = parse(
      csvOf([...rows(700, "Alpha"), ...bad]),
      csvOf(rows(700, "Beta")),
      csvOf(rows(600, "Gamma")),
    );

    // 2,015 rows read, so 20 may be skipped.
    expect(result.skipped).toBe(15);
    expect(result.errors).toBe(0);
    expect(result.records).toHaveLength(3);
  });
});

describe("nhtsaConnector.download", () => {
  const URLS = [
    "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
    "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADAS.csv",
    "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_OTHER.csv",
  ];
  const BODIES = new Map([
    [URLS[0], ADS],
    [URLS[1], ADAS],
    [URLS[2], OTHER],
  ]);

  const answer = (url: string, over: Record<string, unknown> = {}) =>
    ({
      notModified: false,
      url,
      status: 200,
      contentType: "text/csv",
      body: Buffer.from(BODIES.get(url) ?? ""),
      truncated: false,
      etag: '"e"',
      lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
      ...over,
    }) as Awaited<ReturnType<ConnectorFetch>>;

  it("is the connector of nhtsa_sgo, version 1, with the mark its texts begin with", () => {
    expect(nhtsaConnector.id).toBe("nhtsa_sgo");
    expect(nhtsaConnector.version).toBe(1);
    expect(NHTSA_RECORD_MARK).toBe("NHTSA Standing General Order crash reports");
  });

  it("asks the three files in the order ADS, ADAS, OTHER, once each and without validators", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return answer(args[0]);
    };

    const snapshot = await nhtsaConnector.download(fetch, {
      etag: '"stored"',
      lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
    });

    const limits = {
      maxBytes: 32 * 1024 * 1024,
      allowedContentTypes: ["text/csv", "application/csv", "application/octet-stream"],
      totalTimeoutMs: 120_000,
    };
    expect(calls).toEqual(URLS.map((url) => [url, {}, limits]));
    expect(snapshot).toEqual({
      bodies: [ADS, ADAS, OTHER],
      etag: null,
      lastModified: null,
      bytes: Buffer.byteLength(ADS) + Buffer.byteLength(ADAS) + Buffer.byteLength(OTHER),
    });
  });

  it("reads what it downloads into the same records", async () => {
    const snapshot = await nhtsaConnector.download(async (url) => answer(url), {});

    expect(snapshot).not.toBe("unchanged");
    expect(nhtsaConnector.parse(snapshot as Snapshot)).toEqual(parse());
  });

  it("fails as an unreachable file when an answer says that nothing changed, since it sent nothing to be compared", async () => {
    const fetch: ConnectorFetch = async (url) => ({ notModified: true, url });

    await expect(nhtsaConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FetchError",
      reason: "unreachable",
    });
  });

  it("fails a file cut at its limit as too large", async () => {
    const fetch: ConnectorFetch = async (url) => answer(url, { truncated: true });

    await expect(nhtsaConnector.download(fetch, {})).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it.each([
    [
      "another host",
      "https://example.test/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
    ],
    [
      "a host that only starts like it",
      "https://static.nhtsa.gov.example.test/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
    ],
    [
      "another directory",
      "https://static.nhtsa.gov/odi/other/SGO-2021-01_Incident_Reports_ADS.csv",
    ],
    [
      "plain http",
      "http://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
    ],
    [
      "another port",
      "https://static.nhtsa.gov:8443/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
    ],
    ["no address at all", "not an address"],
  ])("refuses an answer that comes from %s, without naming it", async (_name, from) => {
    const fetch: ConnectorFetch = async (url) => answer(url, { url: from });

    const failure = await nhtsaConnector.download(fetch, {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("not_allowed");
    expect((failure as FetchError).message).not.toContain("example.test");
    expect((failure as FetchError).message).not.toContain("static.nhtsa.gov");
  });

  it("accepts an answer from another file of the same directory", async () => {
    const fetch: ConnectorFetch = async (url) =>
      answer(url, {
        url: "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_Renamed.csv",
      });

    const snapshot = await nhtsaConnector.download(fetch, {});

    expect(snapshot).not.toBe("unchanged");
  });
});
