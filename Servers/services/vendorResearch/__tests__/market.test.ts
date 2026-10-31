import { RESEARCH_CATEGORIES } from "../../../domain.layer/interfaces/i.vendorResearch";
import { localQueries, marketOf, regulatorTopicsOf } from "../market";
import { MAX_TOPIC_WORDS, normalizeQuery } from "../queries";
import type { ResearchTarget } from "../target";

const vendor = (name: string, domain: string | null): ResearchTarget => ({
  name,
  domain,
  provides: "Software",
});
const NEWS = ["security_incidents", "legal_regulatory"] as const;

describe("marketOf", () => {
  it.each([
    ["acme.de", "German"],
    ["acme.at", "German"],
    ["acme.co.at", "German"],
    ["acme.fr", "French"],
    ["acme.it", "Italian"],
    ["acme.es", "Spanish"],
    ["acme.nl", "Dutch"],
    ["acme.pt", "Portuguese"],
    ["acme.com.br", "Portuguese"],
  ])("reads the language of %s from its country domain", (domain, language) => {
    expect(marketOf(vendor("Acme", domain))?.language).toBe(language);
  });

  it("tells the Portuguese of Portugal from that of Brazil by the authority and the word for a fine", () => {
    expect(marketOf(vendor("Acme", "acme.pt"))?.topics.legal_regulatory).toContain("CNPD coima");
    expect(marketOf(vendor("Acme", "acme.com.br"))?.topics.legal_regulatory).toContain(
      "ANPD multa",
    );
  });

  it.each([
    "acme.com",
    "acme.io",
    "acme.ai",
    "acme.eu",
    "acme.co.uk",
    "acme.ch",
    "acme.be",
    "acme.se",
    "acme.ca",
  ])("has no market for %s: the domain says nothing of the press of the vendor", (domain) => {
    expect(marketOf(vendor("Acme", domain))).toBeNull();
  });

  it.each([
    ["N26 GmbH", "German"],
    ["Acme AG", "German"],
    ["Acme UG", "German"],
    ["Acme GmbH & Co. KG", "German"],
    ["Acme SAS", "French"],
    ["Acme S.A.S.", "French"],
    ["Acme SASU", "French"],
    ["Acme SARL", "French"],
    ["Acme S.r.l.", "Italian"],
    ["Acme S.p.A.", "Italian"],
    ["Acme S.L.", "Spanish"],
    ["Acme SLU", "Spanish"],
    ["Acme B.V.", "Dutch"],
    ["Acme N.V.", "Dutch"],
    ["Acme Lda", "Portuguese"],
    ["Acme Ltda", "Portuguese"],
  ])(
    "reads the language of %s from its legal form, when the domain says nothing",
    (name, language) => {
      expect(marketOf(vendor(name, "acme.com"))?.language).toBe(language);
      expect(marketOf(vendor(name, null))?.language).toBe(language);
    },
  );

  it.each([
    "Acme",
    "Acme Inc.",
    "Acme Ltd",
    "Acme plc",
    "Acme LLC",
    "Acme Corporation",
    "Acme S.A.",
  ])("has no market for %s: its legal form is English or says no language", (name) => {
    expect(marketOf(vendor(name, "acme.com"))).toBeNull();
  });

  it("reads a legal form only at the end of the name", () => {
    expect(marketOf(vendor("GmbH Analytics", "acme.com"))).toBeNull();
    expect(marketOf(vendor("Acme SAS Analytics", "acme.com"))).toBeNull();
  });

  it("reads the country domain whatever its case", () => {
    expect(marketOf(vendor("Acme", "ACME.DE"))?.language).toBe("German");
  });

  it("reads a legal form after a comma, with or without a space", () => {
    expect(marketOf(vendor("Acme,GmbH", null))?.language).toBe("German");
    expect(marketOf(vendor("Acme, SAS", null))?.language).toBe("French");
    expect(marketOf(vendor("Acme GmbH,", null))?.language).toBe("German");
  });

  it("reads no legal form in a name of one word: SAS is also a company of the United States", () => {
    expect(marketOf(vendor("SAS", "sas.com"))).toBeNull();
    expect(marketOf(vendor("Ltda", null))).toBeNull();
  });

  it("takes a key of its tables only, never a property that every object has", () => {
    expect(marketOf(vendor("Site Constructor", "site.com"))).toBeNull();
    expect(marketOf(vendor("Acme", "acme.constructor"))).toBeNull();
    expect(marketOf(vendor("Acme", "acme.__proto__"))).toBeNull();
  });

  it("lets a country domain win over a legal form", () => {
    expect(marketOf(vendor("Acme GmbH", "acme.fr"))?.language).toBe("French");
  });

  it("reads the Portuguese of Brazil from Ltda and that of Portugal from Lda", () => {
    expect(marketOf(vendor("Acme Ltda", null))?.topics.legal_regulatory).toContain("ANPD multa");
    expect(marketOf(vendor("Acme Lda", null))?.topics.legal_regulatory).toContain("CNPD coima");
  });
});

describe("the stated country", () => {
  const stated = (name: string, domain: string | null, country: string): ResearchTarget => ({
    ...vendor(name, domain),
    identifiers: { country },
  });

  it("the stated country comes before the domain and the legal form", () => {
    expect(marketOf(stated("Acme", "acme.de", "FR"))?.language).toBe("French");
    expect(marketOf(stated("Acme GmbH", "acme.com", "IT"))?.language).toBe("Italian");
    expect(marketOf(stated("Acme", "acme.com", "AT"))?.language).toBe("German");
    expect(marketOf(stated("Acme", null, "BR"))?.topics.legal_regulatory).toContain("ANPD multa");
  });

  it("a stated country of an English-speaking jurisdiction decides too: English, with its authority", () => {
    expect(marketOf(stated("Acme", "acme.de", "US"))).toBeNull();
    expect(marketOf(stated("Acme GmbH", "acme.de", "GB"))).toBeNull();
    expect(marketOf(stated("Acme", "acme.com", "US"))).toBeNull();
    expect(regulatorTopicsOf(stated("Acme GmbH", "acme.de", "GB"))).toEqual([
      "ICO fine",
      "settlement",
    ]);
    expect(regulatorTopicsOf(stated("Acme", "acme.fr", "US"))).toEqual(["FTC", "settlement"]);
    expect(regulatorTopicsOf(stated("Acme SAS", "acme.fr", "AU"))).toEqual(["OAIC", "settlement"]);
    expect(localQueries(stated("Acme GmbH", "acme.de", "IE"), NEWS)).toEqual([]);
  });

  it("a country neither table knows changes nothing", () => {
    expect(marketOf(stated("Acme GmbH", null, "CH"))?.language).toBe("German");
    expect(marketOf(stated("Acme", "acme.it", "JP"))?.language).toBe("Italian");
    expect(marketOf(stated("Acme", "acme.com", "JP"))).toBeNull();
  });

  it("the stated country names the authority of its jurisdiction, before the domain", () => {
    expect(regulatorTopicsOf(stated("Acme", "acme.com", "GB"))).toEqual(["ICO fine", "settlement"]);
    expect(regulatorTopicsOf(stated("Acme", "acme.com", "IE"))).toEqual(["DPC fine", "settlement"]);
    expect(regulatorTopicsOf(stated("Acme", "acme.co.uk", "US"))).toEqual(["FTC", "settlement"]);
    expect(regulatorTopicsOf(stated("Acme", "acme.co.uk", "CH"))).toEqual([
      "ICO fine",
      "settlement",
    ]);
    expect(regulatorTopicsOf(stated("Acme", "acme.co.uk", "FR"))).toEqual([]);
  });
});

describe("localQueries", () => {
  const BRUME = vendor("Brume Logiciels SAS", "brume-logiciels.fr");

  it("gives two queries for each news category, in the language of the market, with the name of its authority", () => {
    expect(localQueries(BRUME, NEWS)).toEqual([
      {
        category: "security_incidents",
        query: "Brume Logiciels fuite de données",
        language: "French",
      },
      { category: "security_incidents", query: "Brume Logiciels cyberattaque", language: "French" },
      { category: "legal_regulatory", query: "Brume Logiciels CNIL sanction", language: "French" },
      { category: "legal_regulatory", query: "Brume Logiciels plainte", language: "French" },
    ]);
  });

  it("names the authority of each market", () => {
    const authority = (domain: string) =>
      localQueries(vendor("Acme", domain), ["legal_regulatory"])[0].query;

    expect(authority("acme.de")).toBe("Acme Datenschutz Bußgeld");
    expect(authority("acme.it")).toBe("Acme Garante privacy sanzione");
    expect(authority("acme.es")).toBe("Acme AEPD multa");
    expect(authority("acme.nl")).toBe("Acme Autoriteit Persoonsgegevens boete");
  });

  it("gives only the categories it is asked for, and none that reads the vendor's website", () => {
    expect(localQueries(BRUME, ["legal_regulatory"]).map((search) => search.query)).toEqual([
      "Brume Logiciels CNIL sanction",
      "Brume Logiciels plainte",
    ]);
    expect(localQueries(BRUME, ["certifications", "ai_specific"])).toEqual([]);
    expect(localQueries(BRUME, [])).toEqual([]);
  });

  it("gives none for a vendor with no market", () => {
    expect(localQueries(vendor("Acme Inc.", "acme.com"), NEWS)).toEqual([]);
  });

  it("gives none for a vendor whose name ends in a property that every object has", () => {
    expect(localQueries(vendor("Site Constructor", "site.com"), NEWS)).toEqual([]);
  });

  it("follows the order of the categories, whatever the order they are asked for", () => {
    expect(
      localQueries(BRUME, ["legal_regulatory", "security_incidents"]).map(
        (search) => search.category,
      ),
    ).toEqual(["security_incidents", "security_incidents", "legal_regulatory", "legal_regulatory"]);
  });
});

describe("regulatorTopicsOf", () => {
  it.each([
    ["acme.com", ["FTC", "settlement"]],
    ["acme.io", ["FTC", "settlement"]],
    ["acme.ch", ["FTC", "settlement"]],
    [null, ["FTC", "settlement"]],
    ["acme.co.uk", ["ICO fine", "settlement"]],
    ["acme.uk", ["ICO fine", "settlement"]],
    ["acme.ie", ["DPC fine", "settlement"]],
    ["acme.com.au", ["OAIC", "settlement"]],
  ])("names the authority of the jurisdiction of %s", (domain, topics) => {
    expect(regulatorTopicsOf(vendor("Acme", domain))).toEqual(topics);
  });

  it("is none for a vendor in a market of another language: its authority is named in that language", () => {
    expect(regulatorTopicsOf(vendor("Acme", "acme.de"))).toEqual([]);
    expect(regulatorTopicsOf(vendor("Acme SAS", null))).toEqual([]);
    expect(regulatorTopicsOf(vendor("Acme", "acme.com.br"))).toEqual([]);
  });

  it("takes a key of its table only, never a property that every object has", () => {
    expect(regulatorTopicsOf(vendor("Acme", "acme.constructor"))).toEqual(["FTC", "settlement"]);
    expect(regulatorTopicsOf(vendor("Acme", "acme.__proto__"))).toEqual(["FTC", "settlement"]);
  });

  it("holds words of at most three, which the query normalizer leaves as they are", () => {
    for (const domain of ["acme.com", "acme.co.uk", "acme.ie", "acme.com.au"]) {
      const target = vendor("Acme", domain);
      for (const topic of regulatorTopicsOf(target)) {
        expect(topic.split(" ").length).toBeLessThanOrEqual(MAX_TOPIC_WORDS);
        expect(normalizeQuery(`Acme ${topic}`, target)).toBe(`Acme ${topic}`);
      }
    }
  });
});

describe("the words of the markets", () => {
  it.each([
    ["acme.de", ["Datenleck", "Cyberangriff", "Datenschutz Bußgeld", "Klage"]],
    ["acme.fr", ["fuite de données", "cyberattaque", "CNIL sanction", "plainte"]],
    ["acme.it", ["violazione dati", "attacco hacker", "Garante privacy sanzione", "causa"]],
    ["acme.es", ["filtración de datos", "ciberataque", "AEPD multa", "demanda"]],
    ["acme.nl", ["datalek", "hack", "Autoriteit Persoonsgegevens boete", "rechtszaak"]],
    ["acme.pt", ["violação de dados", "ciberataque", "CNPD coima", "processo"]],
    ["acme.com.br", ["vazamento de dados", "ataque hacker", "ANPD multa", "processo"]],
  ])("are those of the roadmap for %s", (domain, topics) => {
    expect(localQueries(vendor("Acme", domain), NEWS).map((search) => search.query)).toEqual(
      topics.map((topic) => `Acme ${topic}`),
    );
  });
});

describe("the markets", () => {
  it.each(["acme.de", "acme.fr", "acme.it", "acme.es", "acme.nl", "acme.pt", "acme.com.br"])(
    "hold two queries for each news category of %s, of the name and at most three words, which the query normalizer leaves as they are",
    (domain) => {
      const target = vendor("Acme", domain);

      const queries = localQueries(target, RESEARCH_CATEGORIES);

      expect(queries.map((search) => search.category)).toEqual([
        "security_incidents",
        "security_incidents",
        "legal_regulatory",
        "legal_regulatory",
      ]);
      for (const { query } of queries) {
        expect(query.startsWith("Acme ")).toBe(true);
        expect(query.split(" ").length - 1).toBeLessThanOrEqual(MAX_TOPIC_WORDS);
        expect(normalizeQuery(query, target)).toBe(query);
      }
    },
  );
});
