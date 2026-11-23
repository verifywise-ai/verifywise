import { MAX_RECORDS } from "../types";
import {
  Filing,
  Submissions,
  filingUrl,
  incidentFilings,
  item105Text,
  parseSubmissions,
  parseTickers,
  registrantOf,
  secRecord,
  secSubmissionsUrl,
} from "../sec";

const rawFilings = (rows: Array<Record<string, string>>) => ({
  accessionNumber: rows.map((row) => row.accessionNumber),
  filingDate: rows.map((row) => row.filingDate),
  form: rows.map((row) => row.form),
  items: rows.map((row) => row.items),
  primaryDocument: rows.map((row) => row.primaryDocument),
});

const row = (over: Record<string, string> = {}) => ({
  accessionNumber: "0001262039-26-000003",
  filingDate: "2026-02-05",
  form: "8-K",
  items: "1.05,9.01",
  primaryDocument: "brise-20260205.htm",
  ...over,
});

const raw = (rows: Array<Record<string, string>>, over: Record<string, unknown> = {}) => ({
  cik: "0001262039",
  name: "Brise Networks, Inc.",
  filings: { recent: rawFilings(rows), files: [] },
  ...over,
});

const filing = (over: Partial<Filing> = {}): Filing => ({
  accession: "0001262039-26-000003",
  form: "8-K",
  filedAt: "2026-02-05",
  items: ["1.05", "9.01"],
  document: "brise-20260205.htm",
  ...over,
});

const submissions = (filings: Filing[]): Submissions => ({
  cik: "0001262039",
  name: "Brise Networks, Inc.",
  filings,
});

describe("secSubmissionsUrl", () => {
  it("asks for the filings of one registrant by its ten-digit CIK", () => {
    expect(secSubmissionsUrl("0001262039")).toBe(
      "https://data.sec.gov/submissions/CIK0001262039.json",
    );
  });
});

describe("parseTickers", () => {
  it("reads the registrants of the file: a CIK of ten digits and the name", () => {
    expect(
      parseTickers({
        "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
        "1": { cik_str: "1262039", ticker: "BRSE", title: "Brise Networks, Inc." },
      }),
    ).toEqual([
      { cik: "0000320193", title: "Apple Inc." },
      { cik: "0001262039", title: "Brise Networks, Inc." },
    ]);
  });

  it("leaves out an entry with no usable CIK or name", () => {
    expect(
      parseTickers({
        a: { cik_str: "abc", title: "Bad Id" },
        b: { cik_str: 123456789012, title: "Too Long" },
        c: { cik_str: 5, title: "" },
        d: { cik_str: 5 },
        e: null,
        f: "text",
        g: { cik_str: 9, title: "Good Corp" },
      }),
    ).toEqual([{ cik: "0000000009", title: "Good Corp" }]);
  });

  it("leaves out a CIK of more than ten digits, and reads one that is a text with spaces around it", () => {
    expect(
      parseTickers({
        a: { cik_str: 12345678901, title: "Eleven Digits" },
        b: { cik_str: " 1262039 ", title: "Spaced Corp" },
      }),
    ).toEqual([{ cik: "0001262039", title: "Spaced Corp" }]);
  });

  it("gives nothing for a list of entries, which is not the file", () => {
    expect(parseTickers([{ cik_str: 5, title: "In A List" }])).toEqual([]);
    expect(parseTickers([])).toEqual([]);
  });

  it.each([null, undefined, "x", 4])("gives nothing for %p", (body) => {
    expect(parseTickers(body)).toEqual([]);
  });
});

describe("registrantOf", () => {
  const keys = ["brisenetworks", "brise"];
  const list = [
    { cik: "0000000001", title: "Brise Networks, Inc." },
    { cik: "0000000002", title: "Brise Holdings, Inc." },
    { cik: "0000000003", title: "Brise Networks Staffing Inc." },
  ];

  it("takes the registrant whose name is a name of the vendor, with or without its legal form", () => {
    expect(registrantOf(list, keys)).toEqual(list[0]);
    expect(registrantOf([{ cik: "0000000004", title: "BRISE" }], keys)?.cik).toBe("0000000004");
  });

  it("takes a registrant by its name as written too, when the name of the vendor has no legal form to take off", () => {
    expect(
      registrantOf([{ cik: "0000000005", title: "Brise Networks Inc" }], ["brisenetworksinc"])?.cik,
    ).toBe("0000000005");
  });

  it("does not take a registrant whose name only contains or begins with a name of the vendor", () => {
    expect(registrantOf(list.slice(1), keys)).toBeNull();
  });

  it("is none when two registrants of different CIKs have the name: it is not known which one is meant", () => {
    expect(
      registrantOf(
        [
          { cik: "0000000001", title: "Brise Networks, Inc." },
          { cik: "0000000009", title: "Brise Networks Inc" },
        ],
        keys,
      ),
    ).toBeNull();
  });

  it("is the registrant when several entries (the classes of shares) are one CIK", () => {
    const classes = [
      { cik: "0000000001", title: "Brise Networks, Inc." },
      { cik: "0000000001", title: "Brise Networks, Inc." },
    ];

    expect(registrantOf(classes, keys)?.cik).toBe("0000000001");
  });

  it("is the first entry of the registrant when several entries are one CIK", () => {
    const classes = [
      { cik: "0000000001", title: "Brise Networks, Inc." },
      { cik: "0000000001", title: "BRISE NETWORKS INC (Class B)" },
      { cik: "0000000001", title: "Brise" },
    ];

    expect(registrantOf(classes, keys)).toEqual(classes[0]);
  });

  it("is none for no keys", () => {
    expect(registrantOf(list, [])).toBeNull();
  });
});

describe("parseSubmissions", () => {
  it("reads the name and the 8-K filings that report Item 1.05", () => {
    expect(
      parseSubmissions(
        raw([
          row(),
          row({ accessionNumber: "0001262039-26-000010", form: "8-K", items: "2.02,9.01" }),
          row({
            accessionNumber: "0001262039-26-000011",
            form: "10-Q",
            items: "",
            primaryDocument: "q.htm",
          }),
          row({
            accessionNumber: "0001262039-26-000012",
            form: "8-K/A",
            filingDate: "2026-03-01",
            items: "1.05",
            primaryDocument: "amend.htm",
          }),
        ]),
      ),
    ).toEqual({
      cik: "0001262039",
      name: "Brise Networks, Inc.",
      filings: [
        filing(),
        filing({
          accession: "0001262039-26-000012",
          form: "8-K/A",
          filedAt: "2026-03-01",
          items: ["1.05"],
          document: "amend.htm",
        }),
      ],
    });
  });

  it("leaves out a filing with a bad accession number, day or document name, and one of another form", () => {
    const parsed = parseSubmissions(
      raw([
        row({ accessionNumber: "not-a-number" }),
        row({ accessionNumber: "0001262039-26-000004", filingDate: "yesterday" }),
        row({ accessionNumber: "0001262039-26-000005", primaryDocument: "../etc/passwd" }),
        row({ accessionNumber: "0001262039-26-000006", primaryDocument: "a b.htm" }),
        row({ accessionNumber: "0001262039-26-000007", form: "6-K" }),
        row({ accessionNumber: "0001262039-26-000008", items: "11.05" }),
        row({ accessionNumber: "0001262039-26-000009" }),
      ]),
    );

    expect(parsed?.filings.map((item) => item.accession)).toEqual(["0001262039-26-000009"]);
  });

  it("reads the items as a list, whatever the spaces around the commas", () => {
    const parsed = parseSubmissions(raw([row({ items: " 7.01 , 1.05,9.01 " })]));

    expect(parsed?.filings[0].items).toEqual(["7.01", "1.05", "9.01"]);
  });

  it("reads as many filings as the shortest list has", () => {
    const body = raw([row(), row({ accessionNumber: "0001262039-26-000010" })]);
    (body.filings.recent as { primaryDocument: string[] }).primaryDocument.pop();

    expect(parseSubmissions(body)?.filings).toHaveLength(1);
  });

  it.each([
    ["before", "x0001262039-26-000003"],
    ["after", "0001262039-26-000003x"],
  ])("leaves out an accession number with text %s it", (_where, accessionNumber) => {
    expect(parseSubmissions(raw([row({ accessionNumber })]))?.filings).toEqual([]);
  });

  it.each([
    ["before", "x2026-10-05"],
    ["after", "2026-10-05T10:00:00"],
  ])("leaves out a day with text %s it", (_where, filingDate) => {
    expect(parseSubmissions(raw([row({ filingDate })]))?.filings).toEqual([]);
  });

  it("leaves out a filing with no document name", () => {
    expect(parseSubmissions(raw([row({ primaryDocument: "" })]))?.filings).toEqual([]);
  });

  it("leaves empty items out of the list of items", () => {
    const parsed = parseSubmissions(raw([row({ items: "1.05,,9.01," })]));

    expect(parsed?.filings[0].items).toEqual(["1.05", "9.01"]);
  });

  it("is none when the recent filings are missing or null", () => {
    expect(parseSubmissions({ cik: "1", name: "A Corp", filings: { recent: null } })).toBeNull();
    expect(parseSubmissions({ cik: "1", name: "A Corp", filings: null })).toBeNull();
  });

  it("has a CIK of ten digits whatever the file says, and none when it is not a number", () => {
    expect(parseSubmissions(raw([row()], { cik: "1262039" }))?.cik).toBe("0001262039");
    expect(parseSubmissions(raw([row()], { cik: "abc" }))).toBeNull();
  });

  it("is none for a document that holds no name or no filings", () => {
    expect(parseSubmissions(raw([row()], { name: "" }))).toBeNull();
    expect(parseSubmissions(raw([row()], { name: 4 }))).toBeNull();
    expect(parseSubmissions({ cik: "1", name: "A Corp", filings: {} })).toBeNull();
    expect(parseSubmissions({ cik: "1", name: "A Corp", filings: { recent: [] } })).toBeNull();
  });

  it.each([null, undefined, "x", 4, [], {}])("is none for %p", (body) => {
    expect(parseSubmissions(body)).toBeNull();
  });
});

describe("incidentFilings", () => {
  it("gives the newest first, three at most, and counts the others", () => {
    const { filings, omitted } = incidentFilings(
      submissions([
        filing({ accession: "0001262039-26-000001", filedAt: "2026-01-01" }),
        filing({ accession: "0001262039-26-000002", filedAt: "2026-04-01" }),
        filing({ accession: "0001262039-26-000003", filedAt: "2026-03-01" }),
        filing({ accession: "0001262039-26-000004", filedAt: "2026-02-01" }),
      ]),
      {},
    );

    expect(MAX_RECORDS.sec).toBe(3);
    expect(filings.map((item) => item.accession.slice(-6))).toEqual(["000002", "000003", "000004"]);
    expect(omitted).toEqual({ more: 1 });
  });

  it("gives the greater accession number first for one day", () => {
    const { filings } = incidentFilings(
      submissions([
        filing({ accession: "0001262039-26-000001" }),
        filing({ accession: "0001262039-26-000009" }),
      ]),
      {},
    );

    expect(filings.map((item) => item.accession.slice(-6))).toEqual(["000009", "000001"]);
  });

  it("leaves out a filing before the cutoff and counts it, and keeps one filed on the day", () => {
    const { filings, omitted } = incidentFilings(
      submissions([
        filing({ accession: "0001262039-26-000001", filedAt: "2025-09-30" }),
        filing({ accession: "0001262039-26-000002", filedAt: "2025-10-01" }),
      ]),
      { cutoff: "2025-10-01" },
    );

    expect(filings.map((item) => item.accession.slice(-6))).toEqual(["000002"]);
    expect(omitted).toEqual({ old: 1 });
  });

  it("gives nothing for a registrant with no such filing", () => {
    expect(incidentFilings(submissions([]), {})).toEqual({ filings: [], omitted: {} });
  });
});

describe("filingUrl", () => {
  it("is the document of the filing in the archive of the registrant", () => {
    expect(filingUrl("0001262039", filing())).toBe(
      "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000003/brise-20260205.htm",
    );
  });
});

describe("item105Text", () => {
  const body = (section: string) =>
    "UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. FORM 8-K CURRENT REPORT " +
    "Check the appropriate box below if the Form 8-K filing is intended to simultaneously satisfy " +
    `the filing obligation of the registrant. ${section} Item 9.01 Financial Statements and Exhibits. ` +
    "(d) Exhibits. SIGNATURE Pursuant to the requirements of the Securities Exchange Act.";

  it("is the text of Item 1.05, up to the next item", () => {
    const text = body(
      "Item 1.05 Material Cybersecurity Incidents. On January 3, 2026, Brise Networks detected unauthorized access to a part of its network. " +
        "The company activated its response plan and has not yet determined the scope of the incident.",
    );

    expect(item105Text(text)).toBe(
      "Material Cybersecurity Incidents. On January 3, 2026, Brise Networks detected unauthorized access to a part of its network. " +
        "The company activated its response plan and has not yet determined the scope of the incident.",
    );
  });

  it("writes the white space of the page as single spaces", () => {
    const text = body(
      "Item 1.05\n\n  Material   Cybersecurity\tIncidents.\n On January 3, Brise detected unauthorized access to its network and began its response.",
    );

    expect(item105Text(text)).toBe(
      "Material Cybersecurity Incidents. On January 3, Brise detected unauthorized access to its network and began its response.",
    );
  });

  it("takes the first heading that has a text of its own, and not a mention of the item further on", () => {
    const text =
      "Item 1.05 Material Cybersecurity Incidents. Brise detected a ransomware attack on its systems on January 3 and took them offline. " +
      "Item 8.01 Other Events. The company will file an amendment under Item 1.05 of this Form 8-K when it has more facts to report to its holders. " +
      "Item 9.01 Exhibits.";

    expect(item105Text(text)?.startsWith("Material Cybersecurity Incidents. Brise detected")).toBe(
      true,
    );
    expect(item105Text(text)).not.toContain("amendment");
  });

  it("passes over a mention with no text of its own and takes the next heading", () => {
    const text =
      "Item 1.05 Item 2.02 Results. Item 1.05 Material Cybersecurity Incidents. Brise detected a ransomware attack on its systems on January 3 and took them offline. Item 9.01 Exhibits.";

    expect(item105Text(text)?.startsWith("Material Cybersecurity Incidents. Brise")).toBe(true);
  });

  it("goes to the end of the text when no item follows", () => {
    const text =
      "Item 1.05 Material Cybersecurity Incidents. Brise detected a ransomware attack on its systems on January 3 and took them offline.";

    expect(item105Text(text)).toBe(
      "Material Cybersecurity Incidents. Brise detected a ransomware attack on its systems on January 3 and took them offline.",
    );
  });

  it("cuts a long section at 2,500 characters", () => {
    const text = `Item 1.05 ${"word ".repeat(1000)} Item 9.01 Exhibits.`;

    const section = item105Text(text) ?? "";
    expect(section.length).toBeLessThanOrEqual(2500);
    expect(section.length).toBeGreaterThan(2400);
  });

  it("does not end the section at a mention of Item 1.05 inside it", () => {
    const text =
      "Item 1.05 Material Cybersecurity Incidents. Brise detected a ransomware attack on January 3 and, as Item 1.05 of Form 8-K requires, reports it here and took the systems offline. Item 9.01 Exhibits.";

    expect(item105Text(text)).toContain("took the systems offline");
  });

  it("takes a section of exactly 80 characters and not one of 79", () => {
    const section = (size: number) => `Item 1.05 ${"a".repeat(size)} Item 9.01 Exhibits.`;

    expect(item105Text(section(80))).toBe("a".repeat(80));
    expect(item105Text(section(79))).toBeNull();
  });

  it("cuts a section at exactly 2,500 characters", () => {
    expect(item105Text(`Item 1.05 ${"a".repeat(3000)} Item 9.01 Exhibits.`)).toHaveLength(2500);
  });

  it.each([[". "], [": "], [" - "], [" – "], [" — "]])(
    "starts the section after the punctuation %j that follows the heading",
    (gap) => {
      const text = `Item 1.05${gap}Material Cybersecurity Incidents. Brise detected a ransomware attack on January 3 and took its systems offline. Item 9.01 Exhibits.`;

      expect(item105Text(text)?.startsWith("Material Cybersecurity Incidents.")).toBe(true);
    },
  );

  it("is none when the text has no Item 1.05, or only a heading with next to nothing after it", () => {
    expect(item105Text("Item 2.02 Results of Operations. Revenue grew by ten percent.")).toBeNull();
    expect(
      item105Text("Item 1.05 Material Cybersecurity Incidents. Item 9.01 Exhibits."),
    ).toBeNull();
    expect(item105Text("")).toBeNull();
  });

  it("does not take the number of another item for this one", () => {
    expect(item105Text("Item 11.05 Something Else Entirely. " + "word ".repeat(50))).toBeNull();
    expect(item105Text("Item 1.051 Something Else Entirely. " + "word ".repeat(50))).toBeNull();
  });
});

describe("secRecord", () => {
  it("writes a filing as a source: the facts of the filing and the text of its Item 1.05", () => {
    expect(
      secRecord(
        submissions([]),
        filing({ items: ["1.05", "7.01", "9.01"] }),
        "Brise detected an intrusion.",
      ),
    ).toEqual({
      url: "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000003/brise-20260205.htm",
      title:
        "Brise Networks, Inc.: Form 8-K, Item 1.05 (material cybersecurity incident), filed 2026-02-05",
      text:
        "SEC EDGAR (sec.gov). Company: Brise Networks, Inc. Form: 8-K. Filed: 2026-02-05. " +
        "Items reported: 1.05 (Material Cybersecurity Incidents), 7.01, 9.01. " +
        "Item 1.05: Brise detected an intrusion.",
      publishedAt: "2026-02-05",
    });
  });

  it("says so in the title when the filing is an amendment", () => {
    const record = secRecord(submissions([]), filing({ form: "8-K/A" }), null);

    expect(record.title).toContain("Form 8-K/A, Item 1.05");
  });

  it("is the facts alone when the text of the filing could not be read", () => {
    const record = secRecord(submissions([]), filing(), null);

    expect(record.text).toBe(
      "SEC EDGAR (sec.gov). Company: Brise Networks, Inc. Form: 8-K. Filed: 2026-02-05. " +
        "Items reported: 1.05 (Material Cybersecurity Incidents), 9.01.",
    );
  });
});
