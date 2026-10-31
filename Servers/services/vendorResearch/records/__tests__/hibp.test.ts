import { Breach, hibpRecords, hibpUrl, parseHibp } from "../hibp";

const raw = (over: Record<string, unknown> = {}) => ({
  Name: "Brise",
  Title: "Brise Networks",
  Domain: "brise.example",
  BreachDate: "2026-09-02",
  AddedDate: "2026-09-10T08:01:00Z",
  ModifiedDate: "2026-09-10T08:01:00Z",
  PwnCount: 1234567,
  Description:
    'In September 2026, <a href="https://example.com/news" target="_blank">Brise Networks</a> suffered a <em>data breach</em>. The data included &quot;emails&quot; &amp; passwords.',
  LogoPath: "https://logos.example/Brise.png",
  Attribution: null,
  DisclosureUrl: null,
  DataClasses: ["Email addresses", "Passwords"],
  IsVerified: true,
  IsFabricated: false,
  IsSensitive: false,
  IsRetired: false,
  IsSpamList: false,
  IsMalware: false,
  IsSubscriptionFree: false,
  IsStealerLog: false,
  ...over,
});

const breach = (over: Partial<Breach> = {}): Breach => ({
  name: "Brise",
  title: "Brise Networks",
  domain: "brise.example",
  breachDate: "2026-09-02",
  addedDate: "2026-09-10",
  pwnCount: 1234567,
  description:
    'In September 2026, Brise Networks suffered a data breach. The data included "emails" & passwords.',
  dataClasses: ["Email addresses", "Passwords"],
  verified: true,
  attribution: "",
  ...over,
});

describe("hibpUrl", () => {
  it("asks for the breaches of one domain", () => {
    expect(hibpUrl("brise.example")).toBe(
      "https://haveibeenpwned.com/api/v3/breaches?Domain=brise.example",
    );
  });
});

describe("parseHibp", () => {
  it("reads a breach, with its description as plain text", () => {
    expect(parseHibp([raw()])).toEqual([breach()]);
  });

  it("leaves out what is not a breach of the service: a spam list, malware, a stealer log, a fabricated or a retired entry", () => {
    const parsed = parseHibp([
      raw({ Name: "Spam", IsSpamList: true }),
      raw({ Name: "Malware", IsMalware: true }),
      raw({ Name: "Stealer", IsStealerLog: true }),
      raw({ Name: "Fake", IsFabricated: true }),
      raw({ Name: "Retired", IsRetired: true }),
      raw({ Name: "Real" }),
    ]);

    expect(parsed.map((item) => item.name)).toEqual(["Real"]);
  });

  it("keeps an unverified breach, and says that it is", () => {
    expect(parseHibp([raw({ IsVerified: false })])[0].verified).toBe(false);
  });

  it("leaves out an entry with a name that is no word, or dates that are no days", () => {
    const parsed = parseHibp([
      raw({ Name: "Bad Name!" }),
      raw({ Name: "NoDate", BreachDate: "last year" }),
      raw({ Name: "NoAdded", AddedDate: null }),
      raw({ Name: "Good" }),
      null,
      "text",
    ]);

    expect(parsed.map((item) => item.name)).toEqual(["Good"]);
  });

  it("takes a name of a hundred characters and leaves out one of a hundred and one", () => {
    const parsed = parseHibp([raw({ Name: "A".repeat(100) }), raw({ Name: "B".repeat(101) })]);

    expect(parsed.map((item) => item.name.length)).toEqual([100]);
  });

  it("leaves out dates that do not start with a day", () => {
    const parsed = parseHibp([
      raw({ Name: "BreachPrefix", BreachDate: "x2026-09-02" }),
      raw({ Name: "AddedPrefix", AddedDate: "x2026-09-10T08:01:00Z" }),
      raw({ Name: "Good" }),
    ]);

    expect(parsed.map((item) => item.name)).toEqual(["Good"]);
  });

  it("keeps the day of a date that comes with a time", () => {
    const [parsed] = parseHibp([raw({ BreachDate: "2026-09-02T00:00:00Z" })]);

    expect(parsed.breachDate).toBe("2026-09-02");
    expect(parsed.addedDate).toBe("2026-09-10");
  });

  it("does not call a breach verified unless the data says it is", () => {
    expect(parseHibp([raw({ IsVerified: undefined })])[0].verified).toBe(false);
    expect(parseHibp([raw({ IsVerified: "true" })])[0].verified).toBe(false);
  });

  it("reads a description made to be slow within a short time", () => {
    const startedAt = performance.now();

    parseHibp([raw({ Description: "<".repeat(200_000) })]);

    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it("writes the line breaks and the white space of a description as single spaces", () => {
    const [parsed] = parseHibp([
      raw({ Description: "  First<br>second<br/>third<br />fourth \n\n  fifth\t sixth  " }),
    ]);

    expect(parsed.description).toBe("First second third fourth fifth sixth");
  });

  it("takes the title for the name when the title is missing, and lowers the domain", () => {
    const [parsed] = parseHibp([raw({ Title: undefined, Domain: "Brise.Example" })]);

    expect(parsed.title).toBe("Brise");
    expect(parsed.domain).toBe("brise.example");
  });

  it("has no count when the count is not a number, and only the data classes that are text", () => {
    const [parsed] = parseHibp([raw({ PwnCount: "many", DataClasses: ["Passwords", 4, null] })]);

    expect(parsed.pwnCount).toBeNull();
    expect(parsed.dataClasses).toEqual(["Passwords"]);
  });

  it("takes the attribution that the data gives", () => {
    expect(parseHibp([raw({ Attribution: "Reported by Example News" })])[0].attribution).toBe(
      "Reported by Example News",
    );
  });

  it.each([null, undefined, "x", 4, {}, { Name: "Brise" }])("gives nothing for %p", (body) => {
    expect(parseHibp(body)).toEqual([]);
  });
});

describe("hibpRecords", () => {
  const run = (breaches: Breach[], cutoff?: string) =>
    hibpRecords(breaches, { domain: "brise.example", cutoff });

  it("writes a breach as a source that names Have I Been Pwned and its licence", () => {
    expect(run([breach()])).toEqual({
      records: [
        {
          url: "https://haveibeenpwned.com/api/v3/breach/Brise",
          title: "Brise Networks: data breach listed by Have I Been Pwned",
          text:
            "Have I Been Pwned (haveibeenpwned.com), licensed under CC BY 4.0. " +
            "Breached service: Brise Networks (brise.example). Breach date: 2026-09-02. " +
            "Added to Have I Been Pwned: 2026-09-10. Accounts affected: 1,234,567. " +
            "Data exposed: Email addresses, Passwords. Verified: yes. " +
            'Description: In September 2026, Brise Networks suffered a data breach. The data included "emails" & passwords.',
          publishedAt: "2026-09-10",
        },
      ],
      omitted: {},
    });
  });

  it("says that a breach is not verified, and leaves out what the data does not give", () => {
    const { records } = run([
      breach({ verified: false, pwnCount: null, description: "", dataClasses: [] }),
    ]);

    expect(records[0].text).toBe(
      "Have I Been Pwned (haveibeenpwned.com), licensed under CC BY 4.0. " +
        "Breached service: Brise Networks (brise.example). Breach date: 2026-09-02. " +
        "Added to Have I Been Pwned: 2026-09-10. Verified: no.",
    );
  });

  it("names the party that asked for an attribution", () => {
    const { records } = run([breach({ attribution: "Example News" })]);

    expect(records[0].text.endsWith("Provided by: Example News.")).toBe(true);
  });

  it("takes the breaches of the vendor's domain only", () => {
    const { records } = run([
      breach({ name: "Other", domain: "other.example" }),
      breach({ name: "Same", domain: "BRISE.example" }),
    ]);

    expect(records.map((record) => record.url.split("/").pop())).toEqual(["Same"]);
  });

  it("leaves out a breach added before the cutoff and counts it, and keeps one added on the day", () => {
    const { records, omitted } = run(
      [
        breach({ name: "Old", addedDate: "2024-09-30" }),
        breach({ name: "Day", addedDate: "2024-10-01" }),
        breach({ name: "New", addedDate: "2026-01-01" }),
      ],
      "2024-10-01",
    );

    expect(records.map((record) => record.url.split("/").pop())).toEqual(["New", "Day"]);
    expect(omitted).toEqual({ old: 1 });
  });

  it("gives the newest three, one day by the name, and counts the others", () => {
    const { records, omitted } = run([
      breach({ name: "A", addedDate: "2026-01-01" }),
      breach({ name: "B", addedDate: "2026-03-01" }),
      breach({ name: "D", addedDate: "2026-02-01" }),
      breach({ name: "C", addedDate: "2026-03-01" }),
    ]);

    expect(records.map((record) => record.url.split("/").pop())).toEqual(["B", "C", "D"]);
    expect(omitted).toEqual({ more: 1 });
  });

  it("cuts a long description at 1,200 characters", () => {
    const { records } = run([breach({ description: "x".repeat(3000) })]);

    const description = records[0].text.split("Description: ")[1];
    expect(description).toBe(`${"x".repeat(1200)}.`);
  });

  it("gives nothing for no breach", () => {
    expect(run([])).toEqual({ records: [], omitted: {} });
  });
});
