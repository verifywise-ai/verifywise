/**
 * Who filed an EDGAR filing (Q28, spec D3.2 step 5). The address of a filing says whose folder it is
 * shown under, not who submitted it: a Schedule 13G about a company, and a Form 4 for it, sit in the
 * company's folder. The header of the filing names every party and its role, and a filing is the
 * vendor's own word only when the CIK stored on the vendor is a filer in it.
 *
 * The headers below are written from the documented SGML format, in both forms the SEC writes it in
 * (tags with the CIK on a line of its own, and the lines of the submission's text header), with
 * fictional companies, people, addresses and CIKs.
 */
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import logger from "../../../utils/logger/fileLogger";
import {
  ANY_CONTENT_TYPE,
  FetchError,
  type GuardedFetchOptions,
  type GuardedResponse,
} from "../../webResearch/guardedFetch";
import {
  type FilingRole,
  accessionOfFiling,
  createEdgarFilerResolver,
  parseFilingRoles,
  secHeaderUrl,
} from "../edgarFiler";
import { secUserAgent } from "../vrdb/connectors/sec";

const QUILLON = "0001900101"; // the vendor
const HARBOR = "0001900202"; // an investor
const PAT = "0001900303"; // a person who reports as an insider
const FJORD = "0001900404"; // a co-registrant

const ACCESSION = "0001900101-26-000007";
const FOLDER = "000190010126000007";
const FILING = `https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}/quillon-8k.htm`;
const CONTACT = "sec@company.example";

const NAME_OF: Record<string, string> = {
  [QUILLON]: "Quillon Data Systems, Inc.",
  [HARBOR]: "Harbor Ridge Capital LP",
  [PAT]: "Pat Q. Example",
  [FJORD]: "Fjord Analytics Holdings, Inc.",
};
const STREET = "1 Example Way";

type Party = readonly [role: FilingRole, cik: string];

/** The header as tags: one value to a line, the CIK after the name, a closing tag for a block. */
function asTags(type: string, parties: readonly Party[]): string {
  return [
    "<SUBMISSION>",
    `<ACCESSION-NUMBER>${ACCESSION}`,
    `<TYPE>${type}`,
    "<PUBLIC-DOCUMENT-COUNT>3",
    ...parties.flatMap(([role, cik]) => {
      const data = role === "REPORTING-OWNER" ? "OWNER-DATA" : "COMPANY-DATA";
      return [
        `<${role}>`,
        `<${data}>`,
        `<CONFORMED-NAME>${NAME_OF[cik]}`,
        `<CIK>${cik}`,
        `</${data}>`,
        "<BUSINESS-ADDRESS>",
        `<STREET1>${STREET}`,
        "<CITY>Springfield",
        "</BUSINESS-ADDRESS>",
        `</${role}>`,
      ];
    }),
    "</SUBMISSION>",
    "",
  ].join("\n");
}

const TEXT_LABEL: Record<FilingRole, string> = {
  FILER: "FILER",
  "FILED-BY": "FILED BY",
  "REPORTING-OWNER": "REPORTING-OWNER",
  "SUBJECT-COMPANY": "SUBJECT COMPANY",
  ISSUER: "ISSUER",
};

/** The header as the lines of the submission's text header: a label, then the data of the party. */
function asText(type: string, parties: readonly Party[]): string {
  return [
    `<SEC-HEADER>${ACCESSION}.hdr.sgml : 20261001`,
    "<ACCEPTANCE-DATETIME>20261001120000",
    `ACCESSION NUMBER:\t\t${ACCESSION}`,
    `CONFORMED SUBMISSION TYPE:\t${type}`,
    "PUBLIC DOCUMENT COUNT:\t\t3",
    "",
    ...parties.flatMap(([role, cik]) => [
      `${TEXT_LABEL[role]}:\t`,
      "",
      `\t${role === "REPORTING-OWNER" ? "OWNER DATA" : "COMPANY DATA"}:\t`,
      `\t\tCOMPANY CONFORMED NAME:\t\t\t${NAME_OF[cik]}`,
      `\t\tCENTRAL INDEX KEY:\t\t\t${cik}`,
      "",
      "\tBUSINESS ADDRESS:\t",
      `\t\tSTREET 1:\t\t${STREET}`,
      "\t\tCITY:\t\t\tSpringfield",
      "",
    ]),
    "</SEC-HEADER>",
    "",
  ].join("\n");
}

const LAYOUTS = [
  ["tags", asTags],
  ["text", asText],
] as const;

/** The filings of the plan's list, with the parties their headers name. */
const SCENARIOS: ReadonlyArray<{ name: string; type: string; parties: readonly Party[] }> = [
  { name: "an own 10-K", type: "10-K", parties: [["FILER", QUILLON]] },
  {
    name: "a co-registrant 8-K",
    type: "8-K",
    parties: [
      ["FILER", QUILLON],
      ["FILER", FJORD],
    ],
  },
  {
    name: "a Schedule 13G",
    type: "SCHEDULE 13G",
    parties: [
      ["SUBJECT-COMPANY", QUILLON],
      ["FILED-BY", HARBOR],
    ],
  },
  {
    name: "a Form 4",
    type: "4",
    parties: [
      ["ISSUER", QUILLON],
      ["REPORTING-OWNER", PAT],
    ],
  },
  {
    name: "a self-tender",
    type: "SC TO-I",
    parties: [
      ["SUBJECT-COMPANY", QUILLON],
      ["FILED-BY", QUILLON],
    ],
  },
];

const partiesOf = (parties: readonly Party[]) => parties.map(([role, cik]) => ({ role, cik }));

describe("accessionOfFiling", () => {
  it("reads the folder of an address in the archive", () => {
    expect(accessionOfFiling(FILING)).toBe(ACCESSION);
    expect(accessionOfFiling(`https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}/`)).toBe(
      ACCESSION,
    );
    expect(
      accessionOfFiling(
        `https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}/${ACCESSION}-index.htm`,
      ),
    ).toBe(ACCESSION);
    expect(accessionOfFiling(`https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}`)).toBe(
      ACCESSION,
    );
  });

  it("reads the accession number of the viewer of the SEC", () => {
    expect(
      accessionOfFiling(
        `https://www.sec.gov/cgi-bin/viewer?action=view&cik=1900101&accession_number=${ACCESSION}&xbrl_type=v`,
      ),
    ).toBe(ACCESSION);
  });

  it.each(["https://www.sec.gov/ix", "https://www.sec.gov/ixviewer/ix.html"])(
    "reads the document path of the inline viewer at %s",
    (viewer) => {
      expect(
        accessionOfFiling(`${viewer}?doc=/Archives/edgar/data/1900101/${FOLDER}/q-8k.htm`),
      ).toBe(ACCESSION);
      expect(
        accessionOfFiling(`${viewer}?doc=Archives/edgar/data/1900101/${FOLDER}/q-8k.htm`),
      ).toBe(ACCESSION);
    },
  );

  it("gives the accession with its dashes, from any CIK folder", () => {
    expect(
      accessionOfFiling("https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/a.htm"),
    ).toBe("0000320193-23-000106");
  });

  it.each([
    [
      "a list of a company's filings",
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1900101",
    ],
    [
      "a folder of 17 digits",
      "https://www.sec.gov/Archives/edgar/data/1900101/00019001012600007/x.htm",
    ],
    [
      "a folder of 19 digits",
      "https://www.sec.gov/Archives/edgar/data/1900101/0001900101260000071/x.htm",
    ],
    [
      "a folder of letters",
      "https://www.sec.gov/Archives/edgar/data/1900101/00019001012600000A/x.htm",
    ],
    [
      "the full submission file",
      `https://www.sec.gov/Archives/edgar/data/1900101/${ACCESSION}.txt`,
    ],
    ["a CIK folder alone", "https://www.sec.gov/Archives/edgar/data/1900101/"],
    ["a CIK that is not digits", `https://www.sec.gov/Archives/edgar/data/abc/${FOLDER}/x.htm`],
    ["a viewer without an accession", "https://www.sec.gov/cgi-bin/viewer?action=view&cik=1900101"],
    [
      "a viewer with a malformed accession",
      "https://www.sec.gov/cgi-bin/viewer?accession_number=1900101-26-7",
    ],
    ["an inline viewer without a document", "https://www.sec.gov/ix?x=1"],
    ["an inline viewer of another file", "https://www.sec.gov/ix?doc=/files/company_tickers.json"],
    ["a release of the SEC", "https://www.sec.gov/newsroom/press-releases/2026-1"],
    ["another host", `https://www.example.com/Archives/edgar/data/1900101/${FOLDER}/x.htm`],
    [
      "a host that only ends like the SEC's",
      `https://www.notsec.gov/Archives/edgar/data/1900101/${FOLDER}/x.htm`,
    ],
    [
      "a host that only starts like the SEC's",
      `https://www.sec.gov.example/Archives/edgar/data/1900101/${FOLDER}/x.htm`,
    ],
    ["a path with no host", `/Archives/edgar/data/1900101/${FOLDER}/x.htm`],
    ["an empty string", ""],
    ["text that is no address", "not a url"],
  ])("gives nothing for %s", (_label, address) => {
    expect(accessionOfFiling(address)).toBeNull();
  });

  it("reads a long address in linear time", () => {
    const long = `https://www.sec.gov/Archives/edgar/data/1900101/${"1".repeat(200_000)}`;
    const started = Date.now();
    expect(accessionOfFiling(long)).toBeNull();
    expect(accessionOfFiling(`${FILING}?${"a=1&".repeat(50_000)}`)).toBe(ACCESSION);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("secHeaderUrl", () => {
  it("is the header of the accession in the folder of the CIK, which is written as a number", () => {
    expect(secHeaderUrl(QUILLON, ACCESSION)).toBe(
      `https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}/${ACCESSION}.hdr.sgml`,
    );
    expect(secHeaderUrl("1900101", ACCESSION)).toBe(secHeaderUrl(QUILLON, ACCESSION));
  });
});

describe.each(LAYOUTS)("parseFilingRoles, header as %s", (_layout, build) => {
  it.each(SCENARIOS)("reads the roles and the CIKs of $name", ({ type, parties }) => {
    expect(parseFilingRoles(build(type, parties))).toEqual(partiesOf(parties));
  });

  it("keeps roles and CIK digits only: no name, no address, no other value", () => {
    const read = parseFilingRoles(
      build("SCHEDULE 13G", [
        ["SUBJECT-COMPANY", QUILLON],
        ["FILED-BY", HARBOR],
      ]),
    );

    for (const party of read) expect(Object.keys(party).sort()).toEqual(["cik", "role"]);
    const kept = JSON.stringify(read);
    for (const secret of [...Object.values(NAME_OF), STREET, "Springfield"]) {
      expect(kept).not.toContain(secret);
    }
  });

  it("reads a role that has no CIK as nothing, and the CIK of the next role is not its", () => {
    // The CIK line of the first party goes, so the only CIK left is the issuer's.
    const text = build("8-K", [
      ["FILER", QUILLON],
      ["ISSUER", FJORD],
    ]).replace(/.*(<CIK>|CENTRAL INDEX KEY).*\n/, "");

    expect(parseFilingRoles(text)).toEqual([{ role: "ISSUER", cik: FJORD }]);
  });

  it("reads a CRLF header as it reads an LF one", () => {
    const text = build("8-K", [["FILER", QUILLON]]).replace(/\n/g, "\r\n");

    expect(parseFilingRoles(text)).toEqual([{ role: "FILER", cik: QUILLON }]);
  });

  it("pads a CIK of fewer digits to ten, and takes none of more", () => {
    // The digits after the CIK tag, or after the label of the text header; the accession keeps its own.
    const withCik = (digits: string) =>
      build("8-K", [["FILER", QUILLON]]).replace(/(<CIK>|KEY:\t+)\d+/, `$1${digits}`);

    expect(parseFilingRoles(withCik("1900101"))).toEqual([{ role: "FILER", cik: QUILLON }]);
    expect(parseFilingRoles(withCik("19001010001"))).toEqual([]);
  });
});

describe("parseFilingRoles", () => {
  it("reads the filing of a company in the tags of the submission", () => {
    const text = [
      "<SUBMISSION>",
      "<ACCESSION-NUMBER>0001900202-26-000011",
      "<TYPE>SCHEDULE 13G",
      "<SUBJECT-COMPANY>",
      "<COMPANY-DATA>",
      "<CONFORMED-NAME>Quillon Data Systems, Inc.",
      "<CIK>0001900101",
      "<ASSIGNED-SIC>7372",
      "</COMPANY-DATA>",
      "</SUBJECT-COMPANY>",
      "<FILED-BY>",
      "<COMPANY-DATA>",
      "<CONFORMED-NAME>Harbor Ridge Capital LP",
      "<CIK>0001900202",
      "</COMPANY-DATA>",
      "</FILED-BY>",
      "</SUBMISSION>",
    ].join("\n");

    expect(parseFilingRoles(text)).toEqual([
      { role: "SUBJECT-COMPANY", cik: "0001900101" },
      { role: "FILED-BY", cik: "0001900202" },
    ]);
  });

  it("reads the filing of a company in the lines of the text header", () => {
    const text = [
      "<SEC-HEADER>0001900202-26-000011.hdr.sgml : 20261001",
      "ACCESSION NUMBER:\t\t0001900202-26-000011",
      "CONFORMED SUBMISSION TYPE:\tSCHEDULE 13G",
      "",
      "SUBJECT COMPANY:\t",
      "",
      "\tCOMPANY DATA:\t",
      "\t\tCOMPANY CONFORMED NAME:\t\t\tQuillon Data Systems, Inc.",
      "\t\tCENTRAL INDEX KEY:\t\t\t0001900101",
      "",
      "FILED BY:\t\t",
      "",
      "\tCOMPANY DATA:\t",
      "\t\tCOMPANY CONFORMED NAME:\t\t\tHarbor Ridge Capital LP",
      "\t\tCENTRAL INDEX KEY:\t\t\t0001900202",
      "</SEC-HEADER>",
    ].join("\n");

    expect(parseFilingRoles(text)).toEqual([
      { role: "SUBJECT-COMPANY", cik: "0001900101" },
      { role: "FILED-BY", cik: "0001900202" },
    ]);
  });

  it("reads the role without relying on a closing tag, and ignores the other tags", () => {
    const text = [
      "<FILER>",
      "<SERIAL-COMPANY>",
      "<DEPOSITOR-CIK>0001900999",
      "<COMPANY-DATA>",
      "<CIK>0001900101",
      "<CIK>0001900888",
      "<ISSUER>",
      "<CIK>0001900202",
    ].join("\n");

    // The first CIK after a role is the role's, and the CIKs of other tags are no role's.
    expect(parseFilingRoles(text)).toEqual([
      { role: "FILER", cik: "0001900101" },
      { role: "ISSUER", cik: "0001900202" },
    ]);
  });

  it("does not give the CIK of another party to a role whose block has ended", () => {
    const text = ["<FILER>", "</FILER>", "<CO-REGISTRANT>", "<CIK>0001900404"].join("\n");

    expect(parseFilingRoles(text)).toEqual([]);
  });

  it("reads a CIK with its closing tag and with spaces around it", () => {
    expect(parseFilingRoles("<FILER>\n  <CIK> 0001900101 </CIK>  \n")).toEqual([
      { role: "FILER", cik: "0001900101" },
    ]);
  });

  it("reads the role and the label in any case", () => {
    expect(parseFilingRoles("<filer>\n<cik>0001900101\n")).toEqual([
      { role: "FILER", cik: "0001900101" },
    ]);
    expect(parseFilingRoles("Filed By:\ncentral index key: 0001900101\n")).toEqual([
      { role: "FILED-BY", cik: "0001900101" },
    ]);
  });

  it("does not take the CIK of a line that only starts like a CIK line", () => {
    for (const line of [
      "<CIKS>0001900101",
      "<CIK>x0001900101",
      "<CIK>00019 00101",
      "<CIK>",
      "<CIK>-1",
      "CENTRAL INDEX KEYS: 0001900101",
      "CENTRAL INDEX KEY 0001900101",
      "COMPANY CENTRAL INDEX KEY: 0001900101",
    ]) {
      expect(parseFilingRoles(`<FILER>\n${line}\n`)).toEqual([]);
    }
  });

  it("does not read a line longer than a line of a header can be, which no CIK is on", () => {
    expect(parseFilingRoles(`<FILER>\n<CIK>${" ".repeat(300)}${QUILLON}\n`)).toEqual([]);
    // The same CIK on a line of a usual length is read.
    expect(parseFilingRoles(`<FILER>\n<CIK>${" ".repeat(100)}${QUILLON}\n`)).toEqual([
      { role: "FILER", cik: QUILLON },
    ]);
  });

  it("reads a CIK line that is not a number as the CIK of the role, so that no later one is", () => {
    expect(parseFilingRoles("<FILER>\n<CIK>unknown\n<CIK>0001900101\n")).toEqual([]);
  });

  it("gives nothing for garbage", () => {
    const binary = String.fromCharCode(...Array.from({ length: 200 }, (_value, index) => index));
    for (const garbage of [
      "",
      "\n\n\n",
      "   ",
      "<html><head><title>404 Not Found</title></head><body>Not found</body></html>",
      '{"filer":"0001900101"}',
      "FILER",
      "CIK 0001900101",
      binary,
      "<<<>>><FILER<CIK>",
    ]) {
      expect(parseFilingRoles(garbage)).toEqual([]);
    }
  });

  it("reads a text that is not a string as nothing", () => {
    expect(parseFilingRoles(undefined as never)).toEqual([]);
    expect(parseFilingRoles(null as never)).toEqual([]);
    expect(parseFilingRoles(42 as never)).toEqual([]);
  });

  describe("a body that is cut or oversized", () => {
    const LIMIT = 256 * 1024;
    const pad = (chars: number) => `<ASSIGNED-SIC>${"7".repeat(Math.max(0, chars - 15))}\n`;

    it("reads at most 256 KB: a role after it is not seen", () => {
      const text = `${asTags("10-K", [["FILER", QUILLON]])}${pad(LIMIT)}${asTags("10-K", [["FILER", FJORD]])}`;

      expect(text.length).toBeGreaterThan(LIMIT);
      expect(parseFilingRoles(text)).toEqual([{ role: "FILER", cik: QUILLON }]);
    });

    it("drops the line that the limit cuts, so that half a CIK is not a CIK", () => {
      const head = "<FILER>\n";
      // The limit falls after "<CIK>00019": the rest of the number is the part that is cut.
      const text = `${head}${pad(LIMIT - head.length - "<CIK>00019".length)}<CIK>${QUILLON}\n`;

      expect(text.indexOf("<CIK>") + "<CIK>00019".length).toBe(LIMIT);
      expect(parseFilingRoles(text)).toEqual([]);
    });

    it("keeps the line that ends exactly at the limit", () => {
      const head = "<FILER>\n";
      const line = `<CIK>${QUILLON}\n`;
      const text = `${head}${pad(LIMIT - head.length - line.length)}${line}`;

      expect(text.length).toBe(LIMIT);
      expect(parseFilingRoles(text)).toEqual([{ role: "FILER", cik: QUILLON }]);
    });

    it("keeps a line that the limit ends exactly, when the next character is its line feed", () => {
      const head = "<FILER>\n";
      const line = `<CIK>${QUILLON}`;
      const text = `${head}${pad(LIMIT - head.length - line.length)}${line}\n${asTags("10-K", [["FILER", FJORD]])}`;

      expect(text.indexOf(line) + line.length).toBe(LIMIT);
      expect(text.length).toBeGreaterThan(LIMIT);
      expect(parseFilingRoles(text)).toEqual([{ role: "FILER", cik: QUILLON }]);
    });

    it("reads a header cut in the middle of a line without a trailing newline", () => {
      // A body that is shorter than the limit is read whole: the resolver refuses a cut body.
      expect(parseFilingRoles("<FILER>\n<CIK>0001900101")).toEqual([
        { role: "FILER", cik: QUILLON },
      ]);
    });
  });

  describe("a hostile line", () => {
    const SIZE = 256 * 1024;
    const shapes: Array<[string, string]> = [
      ["angle brackets", "<".repeat(SIZE)],
      ["a CIK tag and spaces", `<CIK>${" ".repeat(SIZE)}x`],
      ["a CIK tag and digits", `<CIK>${"9".repeat(SIZE)}`],
      ["a label and tabs", `CENTRAL INDEX KEY:${"\t".repeat(SIZE)}x`],
      ["a role label and spaces", `FILER:${" ".repeat(SIZE)}x`],
      ["role tags without a break", "<FILER>".repeat(Math.floor(SIZE / 7))],
      ["carriage returns", "\r".repeat(SIZE)],
      ["line feeds", "\n".repeat(SIZE)],
      ["nested closing tags", "</FILER><CIK>".repeat(Math.floor(SIZE / 13))],
    ];

    it.each(shapes)("reads %s in linear time", (_label, line) => {
      const started = Date.now();
      const read = parseFilingRoles(`<FILER>\n<CIK>${QUILLON}\n${line}`);
      const elapsed = Date.now() - started;

      expect(read).toEqual([{ role: "FILER", cik: QUILLON }]);
      // A pattern that backtracks on this much text takes minutes; reading it takes milliseconds.
      expect(elapsed).toBeLessThan(1000);
    });

    it("reads 256 KB of short role and CIK lines in linear time", () => {
      const text = "<FILER>\n<CIK>1\n".repeat(Math.floor(SIZE / 15));
      const started = Date.now();
      const read = parseFilingRoles(text);

      expect(read.length).toBe(Math.floor(SIZE / 15));
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });
});

/** A fetch of the header that answers with a body, or fails, and keeps what it was asked. */
function resolverOf(
  over: {
    body?: string;
    contact?: string | null;
    grant?: boolean;
    truncated?: boolean;
    fail?: unknown;
    contentType?: string;
  } = {},
) {
  let clock = 0;
  const body = over.body ?? asTags("10-K", [["FILER", QUILLON]]);
  const spacer = jest.fn<Promise<boolean>, [AbortSignal]>(async () => over.grant ?? true);
  const fetchHeader = jest.fn<Promise<GuardedResponse>, [string, GuardedFetchOptions?]>(
    async (url) => {
      if (over.fail !== undefined) throw over.fail;
      return {
        url,
        status: 200,
        contentType: over.contentType ?? "text/plain",
        body: Buffer.from(body),
        truncated: over.truncated ?? false,
      };
    },
  );
  const resolver = createEdgarFilerResolver({
    contact: over.contact === undefined ? CONTACT : over.contact,
    spacer,
    fetch: fetchHeader,
    clock: () => clock,
  });
  return {
    resolver,
    spacer,
    fetchHeader,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const signal = new AbortController().signal;
const DAY_MS = 24 * 60 * 60_000;

/** The filing of the sequence number n, of the vendor's folder, with an accession of its own. */
const filingNumber = (n: number) => {
  const serial = String(n).padStart(6, "0");
  return {
    url: `https://www.sec.gov/Archives/edgar/data/1900101/000190010126${serial}/q.htm`,
    accession: `0001900101-26-${serial}`,
  };
};

describe("createEdgarFilerResolver", () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each(LAYOUTS)("header as %s", (_layout, build) => {
    const CO_REGISTRANTS: Party[] = [
      ["FILER", QUILLON],
      ["FILER", FJORD],
    ];
    const SCHEDULE_13G: Party[] = [
      ["SUBJECT-COMPANY", QUILLON],
      ["FILED-BY", HARBOR],
    ];
    const FORM_4: Party[] = [
      ["ISSUER", QUILLON],
      ["REPORTING-OWNER", PAT],
    ];
    const cases: Array<{
      name: string;
      type: string;
      parties: Party[];
      stored: string;
      answer: "vendor" | "other";
    }> = [
      {
        name: "the filer of an own 10-K",
        type: "10-K",
        parties: [["FILER", QUILLON]],
        stored: QUILLON,
        answer: "vendor",
      },
      {
        name: "the first filer of a co-registrant 8-K",
        type: "8-K",
        parties: CO_REGISTRANTS,
        stored: QUILLON,
        answer: "vendor",
      },
      {
        name: "the second filer of a co-registrant 8-K",
        type: "8-K",
        parties: CO_REGISTRANTS,
        stored: FJORD,
        answer: "vendor",
      },
      {
        name: "the subject company of a Schedule 13G",
        type: "SCHEDULE 13G",
        parties: SCHEDULE_13G,
        stored: QUILLON,
        answer: "other",
      },
      {
        name: "the investor who filed a Schedule 13G",
        type: "SCHEDULE 13G",
        parties: SCHEDULE_13G,
        stored: HARBOR,
        answer: "vendor",
      },
      {
        name: "the issuer of a Form 4",
        type: "4",
        parties: FORM_4,
        stored: QUILLON,
        answer: "other",
      },
      {
        name: "the reporting owner of a Form 4",
        type: "4",
        parties: FORM_4,
        stored: PAT,
        answer: "vendor",
      },
      {
        name: "a company that is the subject and the filer of its own tender offer",
        type: "SC TO-I",
        parties: [
          ["SUBJECT-COMPANY", QUILLON],
          ["FILED-BY", QUILLON],
        ],
        stored: QUILLON,
        answer: "vendor",
      },
      {
        name: "a CIK that the header does not name",
        type: "10-K",
        parties: [["FILER", FJORD]],
        stored: QUILLON,
        answer: "other",
      },
    ];

    it.each(cases)("$name is $answer", async ({ type, parties, stored, answer }) => {
      const { resolver } = resolverOf({ body: build(type, parties) });

      expect(await resolver(FILING, stored, signal)).toBe(answer);
    });
  });

  it("compares CIKs as numbers: the stored one has ten digits and the header may have fewer", async () => {
    const { resolver } = resolverOf({ body: "<FILER>\n<CIK>1900101\n" });

    expect(await resolver(FILING, QUILLON, signal)).toBe("vendor");
    expect(await resolver(FILING, "1900101", signal)).toBe("vendor");
  });

  it("asks the header of the accession in the folder of the stored CIK, with the contact, one turn and the signal", async () => {
    const { resolver, spacer, fetchHeader } = resolverOf();

    await resolver(FILING, QUILLON, signal);

    expect(spacer).toHaveBeenCalledTimes(1);
    expect(spacer).toHaveBeenCalledWith(signal);
    expect(fetchHeader).toHaveBeenCalledTimes(1);
    expect(fetchHeader).toHaveBeenCalledWith(
      secHeaderUrl(QUILLON, ACCESSION),
      expect.objectContaining({ signal, userAgent: secUserAgent(CONTACT) }),
    );
    expect(fetchHeader.mock.calls[0][1]?.userAgent).toBe(`VerifyWise ${CONTACT}`);
  });

  it("takes its turn before it asks", async () => {
    const order: string[] = [];
    const resolver = createEdgarFilerResolver({
      contact: CONTACT,
      spacer: async () => {
        order.push("turn");
        return true;
      },
      fetch: async (url) => {
        order.push("fetch");
        return {
          url,
          status: 200,
          contentType: "text/plain",
          body: Buffer.alloc(0),
          truncated: false,
        };
      },
    });

    await resolver(FILING, QUILLON, signal);

    expect(order).toEqual(["turn", "fetch"]);
  });

  it("accepts text/plain and any other type, and reads at most 256 KB", async () => {
    const { resolver, fetchHeader } = resolverOf();

    await resolver(FILING, QUILLON, signal);

    const options = fetchHeader.mock.calls[0][1];
    expect(options?.allowedContentTypes).toEqual(["text/plain", ANY_CONTENT_TYPE]);
    expect(options?.maxBytes).toBe(256 * 1024);
  });

  it.each([
    ["text/plain", "text/plain; charset=utf-8"],
    ["no type at all", ""],
    ["octet-stream", "application/octet-stream"],
  ])("reads the header the SEC serves as %s", async (_label, contentType) => {
    const { resolver } = resolverOf({ contentType });

    expect(await resolver(FILING, QUILLON, signal)).toBe("vendor");
  });

  it("asks the same header for a viewer address as for the archive", async () => {
    const { resolver, fetchHeader } = resolverOf();

    await resolver(
      `https://www.sec.gov/ix?doc=/Archives/edgar/data/1900101/${FOLDER}/quillon-8k.htm`,
      QUILLON,
      signal,
    );
    await resolver(
      `https://www.sec.gov/cgi-bin/viewer?action=view&cik=1900101&accession_number=${ACCESSION}`,
      QUILLON,
      signal,
    );

    expect(fetchHeader).toHaveBeenCalledTimes(1);
    expect(fetchHeader).toHaveBeenCalledWith(secHeaderUrl(QUILLON, ACCESSION), expect.anything());
  });

  describe("the memory", () => {
    it("keeps one answer for an accession: the second filing page of it asks nothing", async () => {
      const { resolver, spacer, fetchHeader } = resolverOf();

      await resolver(FILING, QUILLON, signal);
      await resolver(
        `https://www.sec.gov/Archives/edgar/data/1900101/${FOLDER}/ex99.htm`,
        QUILLON,
        signal,
      );

      expect(fetchHeader).toHaveBeenCalledTimes(1);
      expect(spacer).toHaveBeenCalledTimes(1);
    });

    it("keeps the parties, not the answer: another CIK in the same accession is answered from the memory", async () => {
      const { resolver, fetchHeader } = resolverOf({
        body: asTags("SCHEDULE 13G", [
          ["SUBJECT-COMPANY", QUILLON],
          ["FILED-BY", HARBOR],
        ]),
      });

      expect(await resolver(FILING, QUILLON, signal)).toBe("other");
      expect(await resolver(FILING, HARBOR, signal)).toBe("vendor");
      expect(fetchHeader).toHaveBeenCalledTimes(1);
    });

    it("shares one request between calls for an accession that are made together", async () => {
      let release: (response: GuardedResponse) => void = () => undefined;
      const fetchHeader = jest.fn(
        () => new Promise<GuardedResponse>((resolve) => (release = resolve)),
      );
      const spacer = jest.fn(async () => true);
      const resolver = createEdgarFilerResolver({ contact: CONTACT, spacer, fetch: fetchHeader });

      const first = resolver(FILING, QUILLON, signal);
      const second = resolver(FILING, QUILLON, signal);
      await new Promise((resolve) => setImmediate(resolve));
      release({
        url: FILING,
        status: 200,
        contentType: "text/plain",
        body: Buffer.from(asTags("10-K", [["FILER", QUILLON]])),
        truncated: false,
      });

      expect(await Promise.all([first, second])).toEqual(["vendor", "vendor"]);
      expect(fetchHeader).toHaveBeenCalledTimes(1);
      expect(spacer).toHaveBeenCalledTimes(1);
    });

    it("keeps an answer for 24 hours", async () => {
      const { resolver, fetchHeader, advance } = resolverOf();

      await resolver(FILING, QUILLON, signal);
      advance(DAY_MS - 1);
      await resolver(FILING, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1);

      advance(1);
      await resolver(FILING, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(2);
    });

    it("keeps an accession apart from another", async () => {
      const { resolver, fetchHeader } = resolverOf();

      await resolver(filingNumber(1).url, QUILLON, signal);
      await resolver(filingNumber(2).url, QUILLON, signal);

      expect(fetchHeader).toHaveBeenCalledTimes(2);
    });

    it("keeps at most 1,000 answers, and forgets the oldest", async () => {
      const { resolver, fetchHeader } = resolverOf();

      for (let n = 1; n <= 1000; n += 1) await resolver(filingNumber(n).url, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1000);
      // A thousand are held, the first among them.
      await resolver(filingNumber(1).url, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1000);

      // The 1,001st takes the place of the oldest, which is the first.
      await resolver(filingNumber(1001).url, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1001);
      await resolver(filingNumber(2).url, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1001);
      await resolver(filingNumber(1).url, QUILLON, signal);
      expect(fetchHeader).toHaveBeenCalledTimes(1002);
    });
  });

  describe("what it does not know", () => {
    it("is null while the contact is not given, and asks for nothing", async () => {
      const { resolver, spacer, fetchHeader } = resolverOf({ contact: null });

      expect(await resolver(FILING, QUILLON, signal)).toBeNull();
      expect(spacer).not.toHaveBeenCalled();
      expect(fetchHeader).not.toHaveBeenCalled();
    });

    it("is null when the turn is refused, asks nothing, and tries again the next time", async () => {
      const refused = resolverOf({ grant: false });

      expect(await refused.resolver(FILING, QUILLON, signal)).toBeNull();
      expect(refused.fetchHeader).not.toHaveBeenCalled();

      let grant = false;
      const spacer = jest.fn(async () => grant);
      const fetchHeader = jest.fn(async (url: string): Promise<GuardedResponse> => ({
        url,
        status: 200,
        contentType: "text/plain",
        body: Buffer.from(asTags("10-K", [["FILER", QUILLON]])),
        truncated: false,
      }));
      const resolver = createEdgarFilerResolver({ contact: CONTACT, spacer, fetch: fetchHeader });
      expect(await resolver(FILING, QUILLON, signal)).toBeNull();
      grant = true;
      expect(await resolver(FILING, QUILLON, signal)).toBe("vendor");
      expect(spacer).toHaveBeenCalledTimes(2);
    });

    it("is null when the signal has stopped, without a request", async () => {
      const stopped = new AbortController();
      stopped.abort();
      const spacer = jest.fn(async (turnSignal: AbortSignal) => !turnSignal.aborted);
      const fetchHeader = jest.fn();
      const resolver = createEdgarFilerResolver({ contact: CONTACT, spacer, fetch: fetchHeader });

      expect(await resolver(FILING, QUILLON, stopped.signal)).toBeNull();
      expect(fetchHeader).not.toHaveBeenCalled();
    });

    it("is null when the turn fails, and does not throw", async () => {
      const resolver = createEdgarFilerResolver({
        contact: CONTACT,
        spacer: async () => {
          throw new Error("redis is down");
        },
        fetch: jest.fn(),
      });

      expect(await resolver(FILING, QUILLON, signal)).toBeNull();
    });

    it.each([
      ["not found", new FetchError("not_found", undefined, { status: 404 })],
      ["blocked by the site", new FetchError("blocked_by_site", undefined, { status: 403 })],
      ["unreachable", new FetchError("unreachable")],
      ["not allowed", new FetchError("not_allowed")],
      ["unsupported", new FetchError("unsupported_type")],
      ["another error", new TypeError("boom")],
      ["a value that is no error", "boom"],
    ])("is null when the fetch fails: %s, and the failure is not kept", async (_label, fail) => {
      const failing = resolverOf({ fail });

      expect(await failing.resolver(FILING, QUILLON, signal)).toBeNull();
      expect(await failing.resolver(FILING, QUILLON, signal)).toBeNull();
      expect(failing.fetchHeader).toHaveBeenCalledTimes(2);
    });

    it("is null when the body was cut, and a cut body is not kept", async () => {
      const cut = resolverOf({ truncated: true });

      expect(await cut.resolver(FILING, QUILLON, signal)).toBeNull();
      expect(await cut.resolver(FILING, QUILLON, signal)).toBeNull();
      expect(cut.fetchHeader).toHaveBeenCalledTimes(2);
    });

    it("is null for an address that is no filing, without a turn", async () => {
      const { resolver, spacer, fetchHeader } = resolverOf();

      for (const address of [
        "https://www.sec.gov/newsroom/press-releases/2026-1",
        "https://www.example.com/Archives/edgar/data/1900101/" + FOLDER + "/x.htm",
        "not a url",
        "",
      ]) {
        expect(await resolver(address, QUILLON, signal)).toBeNull();
      }
      expect(spacer).not.toHaveBeenCalled();
      expect(fetchHeader).not.toHaveBeenCalled();
    });

    it.each(["", "CIK 12", "12345678901", "-1", "0x10", "1e3", " 1900101"])(
      "is null for the stored CIK %j, which is no CIK, without a turn",
      async (stored) => {
        const { resolver, spacer } = resolverOf();

        expect(await resolver(FILING, stored, signal)).toBeNull();
        expect(spacer).not.toHaveBeenCalled();
      },
    );
  });

  it("answers other for a body that names no party, and says so in the log without naming anything", async () => {
    const { resolver } = resolverOf({ body: "<html><body>Request denied</body></html>" });

    expect(await resolver(FILING, QUILLON, signal)).toBe("other");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const line = String((logger.warn as jest.Mock).mock.calls[0][0]);
    expect(line).not.toContain(ACCESSION);
    expect(line).not.toContain(FOLDER);
    expect(line).not.toContain("1900101");
    expect(line).not.toContain("sec.gov");
  });

  it("logs a failed fetch by its reason alone: no address, accession, CIK or message", async () => {
    const { resolver } = resolverOf({
      fail: new FetchError("blocked_by_site", `refused ${FILING} for ${CONTACT}`, { status: 403 }),
    });

    await resolver(FILING, QUILLON, signal);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const line = String((logger.warn as jest.Mock).mock.calls[0][0]);
    expect(line).toContain("blocked_by_site");
    for (const secret of [ACCESSION, FOLDER, "1900101", "sec.gov", CONTACT, "quillon"]) {
      expect(line).not.toContain(secret);
    }
  });

  it.each([
    ["an error", new Error(`socket closed on ${FILING} for ${CONTACT}`), "error Error"],
    ["a type error", new TypeError(`bad address ${FILING} of ${QUILLON}`), "error TypeError"],
    [
      "an error whose name is an address",
      Object.assign(new Error("closed"), { name: FILING }),
      "error unknown",
    ],
  ])(
    "logs %s that is no fetch failure by its name alone: no address, accession, CIK or message",
    async (_label, failure, said) => {
      const { resolver } = resolverOf({ fail: failure });

      expect(await resolver(FILING, QUILLON, signal)).toBeNull();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const line = String((logger.warn as jest.Mock).mock.calls[0][0]);
      expect(line).toContain(said);
      for (const secret of [ACCESSION, FOLDER, "1900101", "sec.gov", CONTACT, "quillon"]) {
        expect(line).not.toContain(secret);
      }
    },
  );

  it("logs nothing for a refused turn, which only says the SEC is busy", async () => {
    const { resolver } = resolverOf({ grant: false });

    await resolver(FILING, QUILLON, signal);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs nothing for an answer it could read", async () => {
    const { resolver } = resolverOf();

    await resolver(FILING, QUILLON, signal);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  describe("by default", () => {
    /** The module as a fresh process loads it, with the constants it reads set as the test says. */
    function loaded(mocks: Record<string, () => object>) {
      let edgarFiler!: typeof import("../edgarFiler");
      jest.isolateModules(() => {
        for (const [path, factory] of Object.entries(mocks)) jest.doMock(path, factory);
        edgarFiler = jest.requireActual("../edgarFiler");
      });
      for (const path of Object.keys(mocks)) jest.dontMock(path);
      return edgarFiler;
    }
    const answers = (): GuardedResponse => ({
      url: FILING,
      status: 200,
      contentType: "text/plain",
      body: Buffer.from(asTags("10-K", [["FILER", QUILLON]])),
      truncated: false,
    });

    it("is null while the gate of Q4 is closed: SEC_CONTACT is null", async () => {
      const { createEdgarFilerResolver: create } = loaded({
        "../vrdb/gates": () => ({ ...jest.requireActual("../vrdb/gates"), SEC_CONTACT: null }),
      });
      const fetchHeader = jest.fn(async () => answers());
      const spacer = jest.fn(async () => true);

      expect(await create({ spacer, fetch: fetchHeader })(FILING, QUILLON, signal)).toBeNull();
      expect(spacer).not.toHaveBeenCalled();
      expect(fetchHeader).not.toHaveBeenCalled();
    });

    it("names SEC_CONTACT in the User-Agent once the gate is open", async () => {
      const { createEdgarFilerResolver: create } = loaded({
        "../vrdb/gates": () => ({
          ...jest.requireActual("../vrdb/gates"),
          SEC_CONTACT: "role@company.example",
        }),
      });
      const fetchHeader = jest.fn<Promise<GuardedResponse>, [string, GuardedFetchOptions?]>(
        async () => answers(),
      );

      expect(
        await create({ spacer: async () => true, fetch: fetchHeader })(FILING, QUILLON, signal),
      ).toBe("vendor");
      expect(fetchHeader.mock.calls[0][1]?.userAgent).toBe("VerifyWise role@company.example");
    });

    it("takes its turns from the window of the SEC that every worker shares", async () => {
      const takeTurn = jest.fn(async () => true);
      const createSharedSpacer = jest.fn(() => takeTurn);
      const { createEdgarFilerResolver: create } = loaded({
        "../records/sharedSpacer": () => ({
          ...jest.requireActual("../records/sharedSpacer"),
          createSharedSpacer,
        }),
      });
      const fetchHeader = jest.fn(async () => answers());

      expect(await create({ contact: CONTACT, fetch: fetchHeader })(FILING, QUILLON, signal)).toBe(
        "vendor",
      );
      expect(createSharedSpacer).toHaveBeenCalledWith(
        { limit: 5, windowMs: 1000, maxWaitMs: 2000 },
        { redis: expect.objectContaining({ eval: expect.any(Function) }), key: "vrdb:spacer:sec" },
      );
      expect(takeTurn).toHaveBeenCalledWith(signal);
    });
  });
});
