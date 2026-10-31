import { RESEARCH_CATEGORIES } from "../../../domain.layer/interfaces/i.vendorResearch";
import { REPEATED_QUERY_JACCARD, queryWords, similarity } from "../../webResearch/queryMatch";
import { MAX_TOPIC_WORDS, normalizeQuery, suggestedQueries } from "../queries";
import { ResearchTarget } from "../target";

const ACME: ResearchTarget = {
  name: "Acme Analytics, Inc.",
  domain: "acme-analytics.com",
  provides: "Product analytics",
};

describe("normalizeQuery", () => {
  it("leaves a query of the vendor's name and a topic as it is", () => {
    expect(normalizeQuery("Acme Analytics data breach", ACME)).toBe("Acme Analytics data breach");
  });

  it("puts the name first, without the legal form that the record carries", () => {
    expect(normalizeQuery("data breach Acme Analytics, Inc.", ACME)).toBe(
      "Acme Analytics data breach",
    );
  });

  it("adds the name to a query that lacks it", () => {
    expect(normalizeQuery("data breach", ACME)).toBe("Acme Analytics data breach");
  });

  it("takes the domain for the name and puts the name in its place", () => {
    expect(normalizeQuery("acme-analytics.com breach", ACME)).toBe("Acme Analytics breach");
  });

  it("keeps the name alone when nothing else is asked", () => {
    expect(normalizeQuery("Acme Analytics", ACME)).toBe("Acme Analytics");
    expect(normalizeQuery("???", ACME)).toBe("Acme Analytics");
  });

  it("removes the operators of a search engine, which the feed does not understand", () => {
    expect(
      normalizeQuery('site:acme-analytics.com inurl:trust "Acme Analytics" security -jobs', ACME),
    ).toBe("Acme Analytics security");
    expect(normalizeQuery("Acme Analytics filetype:pdf intitle:dpa before:2025", ACME)).toBe(
      "Acme Analytics",
    );
  });

  it("removes the boolean words and the punctuation of a query that tries to be clever", () => {
    expect(normalizeQuery("(Acme Analytics) AND (breach OR incident) | hack", ACME)).toBe(
      "Acme Analytics breach incident hack",
    );
  });

  it("removes an address from the query", () => {
    expect(normalizeQuery("Acme Analytics https://example.com/leak?id=1 breach", ACME)).toBe(
      "Acme Analytics breach",
    );
  });

  it("drops the small words that only dilute a query", () => {
    expect(normalizeQuery("what is the lawsuit about Acme Analytics", ACME)).toBe(
      "Acme Analytics lawsuit",
    );
  });

  it("keeps at most three topic words, the first ones", () => {
    expect(MAX_TOPIC_WORDS).toBe(3);
    expect(normalizeQuery("Acme Analytics data breach incident ransomware attack 2025", ACME)).toBe(
      "Acme Analytics data breach incident",
    );
  });

  it("repeats no word, in any case", () => {
    expect(normalizeQuery("Acme Analytics breach BREACH Breach lawsuit", ACME)).toBe(
      "Acme Analytics breach lawsuit",
    );
  });

  it("does not take a word of the name for a topic", () => {
    expect(normalizeQuery("Acme breach analytics", ACME)).toBe("Acme Analytics breach");
  });

  it("keeps the vendor's name as the record writes it when there is no legal form to remove", () => {
    expect(normalizeQuery("breach", { ...ACME, name: "OpenAI" })).toBe("OpenAI breach");
  });

  it("keeps a word in another language or script", () => {
    expect(normalizeQuery("Datenleck Acme Analytics", ACME)).toBe("Acme Analytics Datenleck");
    expect(normalizeQuery("Acme Analytics 数据泄露", ACME)).toBe("Acme Analytics 数据泄露");
  });

  it("is idempotent", () => {
    for (const raw of [
      'site:x.com "Acme Analytics" (breach OR fine) -job lawsuit settlement 2024',
      "what is the breach",
      "acme-analytics.com",
    ]) {
      const once = normalizeQuery(raw, ACME);
      expect(normalizeQuery(once, ACME)).toBe(once);
    }
  });

  it("never gives more than 200 characters", () => {
    const long = normalizeQuery(`${"w".repeat(150)} ${"x".repeat(150)}`, ACME);
    expect(long.length).toBeLessThanOrEqual(200);
  });

  it("handles a vendor whose whole name is a legal form", () => {
    expect(normalizeQuery("Limited breach", { ...ACME, name: "Limited" })).toBe("Limited breach");
  });
});

describe("normalizeQuery for a vendor with other names", () => {
  const META: ResearchTarget = {
    name: "Meta Platforms, Inc.",
    domain: "facebook.com",
    provides: "Social media",
    aliases: ["Facebook", "WhatsApp Inc."],
  };

  it("leads with the other name when the query names the vendor only by it, as the press writes it", () => {
    expect(normalizeQuery("Facebook data breach", META)).toBe("Facebook data breach");
    expect(normalizeQuery("data breach Facebook", META)).toBe("Facebook data breach");
  });

  it("writes the other name without its legal form", () => {
    expect(normalizeQuery("WhatsApp Inc. fine", META)).toBe("WhatsApp fine");
  });

  it("leads with the name when the query holds it, and keeps the other name as a topic word", () => {
    expect(normalizeQuery("Meta Platforms Facebook breach", META)).toBe(
      "Meta Platforms Facebook breach",
    );
    // "Meta" alone is a word of the name, not the name, so it is Facebook that the query names.
    expect(normalizeQuery("Meta Facebook breach", META)).toBe("Facebook breach");
  });

  it("leads with the other name that comes first in the query, and keeps the next one as a topic", () => {
    expect(normalizeQuery("WhatsApp Facebook outage", META)).toBe("WhatsApp Facebook outage");
    expect(normalizeQuery("outage Facebook WhatsApp", META)).toBe("Facebook outage WhatsApp");
  });

  it("does not repeat the words of the other name that leads", () => {
    expect(normalizeQuery("Facebook facebook breach", META)).toBe("Facebook breach");
    expect(normalizeQuery("Facebook Lite breach", META)).toBe("Facebook Lite breach");
  });

  it("leads with the name when the query holds no name of the vendor", () => {
    expect(normalizeQuery("data breach", META)).toBe("Meta Platforms data breach");
  });

  it("takes the domain for the name, also when the query holds another name of the vendor", () => {
    expect(normalizeQuery("facebook.com breach", META)).toBe("Meta Platforms breach");
    expect(normalizeQuery("facebook.com Facebook breach", META)).toBe("Facebook breach");
  });

  it("does not repeat a word of the other name that leads, where the query says it again", () => {
    const orbit: ResearchTarget = {
      name: "Zeta Systems",
      domain: "zeta.io",
      provides: "Hosting",
      aliases: ["Orbit Suite"],
    };

    expect(normalizeQuery("Orbit Suite breach Suite", orbit)).toBe("Orbit Suite breach");
  });

  it("leads with the other name that stands first in the query, by either of its written forms", () => {
    const orbit: ResearchTarget = {
      name: "Zeta Systems",
      domain: "zeta.io",
      provides: "Hosting",
      aliases: ["The Orbit Co", "Quark"],
    };

    // "Orbit", the form without the article and the legal form, stands before "Quark"; the form as
    // the record writes it stands after.
    expect(normalizeQuery("Orbit news Quark The Orbit Co breach", orbit)).toBe(
      "Orbit Quark breach",
    );
  });

  it("does not take a word of the vendor's name for a topic when another name leads", () => {
    expect(normalizeQuery("Facebook Meta breach", META)).toBe("Facebook breach");
  });

  it("is idempotent", () => {
    for (const raw of [
      "Facebook data breach",
      "WhatsApp Facebook outage",
      "Meta Facebook breach",
      "data breach",
    ]) {
      const once = normalizeQuery(raw, META);
      expect(normalizeQuery(once, META)).toBe(once);
    }
  });

  it("behaves as before for a vendor with no other names", () => {
    const plain = { ...META, aliases: undefined };

    expect(normalizeQuery("Facebook data breach", plain)).toBe(
      "Meta Platforms Facebook data breach",
    );
    expect(normalizeQuery("Facebook data breach", { ...META, aliases: [] })).toBe(
      "Meta Platforms Facebook data breach",
    );
  });
});

describe("suggestedQueries", () => {
  it("gives short news queries for the categories that search the news", () => {
    expect(suggestedQueries(ACME, ["security_incidents", "legal_regulatory"])).toEqual({
      security_incidents: ["Acme Analytics data breach", "Acme Analytics security incident"],
      legal_regulatory: [
        "Acme Analytics lawsuit",
        "Acme Analytics fined",
        "Acme Analytics FTC",
        "Acme Analytics settlement",
      ],
    });
  });

  it("gives none for the categories that read the vendor's own website", () => {
    expect(suggestedQueries(ACME, ["certifications", "ai_specific"])).toEqual({});
  });

  it("gives one query for the outages of the service, for the category of availability", () => {
    expect(suggestedQueries(ACME, ["availability"])).toEqual({
      availability: ["Acme Analytics outage"],
    });
  });

  it("gives a vendor in a market of another language the English query for outages only", () => {
    const brume = {
      name: "Brume Logiciels SAS",
      domain: "brume-logiciels.fr",
      provides: "Software",
    };

    expect(suggestedQueries(brume, ["availability"])).toEqual({
      availability: ["Brume Logiciels outage"],
    });
  });

  it("gives three queries for the solvency of the vendor, for the category of financial health", () => {
    expect(suggestedQueries(ACME, ["financial_health"])).toEqual({
      financial_health: [
        "Acme Analytics layoffs",
        "Acme Analytics bankruptcy",
        "Acme Analytics acquisition",
      ],
    });
  });

  it("gives a vendor in a market of another language the English queries for financial health only", () => {
    const brume = {
      name: "Brume Logiciels SAS",
      domain: "brume-logiciels.fr",
      provides: "Software",
    };

    expect(suggestedQueries(brume, ["financial_health"])).toEqual({
      financial_health: [
        "Brume Logiciels layoffs",
        "Brume Logiciels bankruptcy",
        "Brume Logiciels acquisition",
      ],
    });
  });

  it("gives only the categories it is asked for", () => {
    expect(suggestedQueries(ACME, ["legal_regulatory"])).toEqual({
      legal_regulatory: [
        "Acme Analytics lawsuit",
        "Acme Analytics fined",
        "Acme Analytics FTC",
        "Acme Analytics settlement",
      ],
    });
  });

  describe("for a vendor in a market of another language", () => {
    const BRUME: ResearchTarget = {
      name: "Brume Logiciels SAS",
      domain: "brume-logiciels.fr",
      provides: "Software",
    };

    it("adds the queries in the language of the market after the English ones", () => {
      expect(suggestedQueries(BRUME, ["security_incidents", "legal_regulatory"])).toEqual({
        security_incidents: [
          "Brume Logiciels data breach",
          "Brume Logiciels security incident",
          "Brume Logiciels fuite de données",
          "Brume Logiciels cyberattaque",
        ],
        legal_regulatory: [
          "Brume Logiciels lawsuit",
          "Brume Logiciels fined",
          "Brume Logiciels CNIL sanction",
          "Brume Logiciels plainte",
        ],
      });
    });

    it("puts the query of the first other name between the English queries and the local ones", () => {
      const known = { ...BRUME, aliases: ["Brume Cloud"] };

      expect(suggestedQueries(known, ["legal_regulatory"]).legal_regulatory).toEqual([
        "Brume Logiciels lawsuit",
        "Brume Logiciels fined",
        "Brume Cloud lawsuit",
        "Brume Logiciels CNIL sanction",
        "Brume Logiciels plainte",
      ]);
    });

    it("gives no two queries that the session would take for one, in any market", () => {
      for (const domain of [
        "brume.de",
        "brume.fr",
        "brume.it",
        "brume.es",
        "brume.nl",
        "brume.pt",
        "brume.com.br",
      ]) {
        const target = { ...BRUME, name: "Brume", domain, aliases: ["Cirrus"] };
        const queries = Object.values(suggestedQueries(target, RESEARCH_CATEGORIES))
          .flat()
          .map((query) => queryWords(query));

        for (let first = 0; first < queries.length; first += 1) {
          for (let second = first + 1; second < queries.length; second += 1) {
            expect(similarity(queries[first], queries[second])).toBeLessThan(
              REPEATED_QUERY_JACCARD,
            );
          }
        }
      }
    });
  });

  describe("for a vendor with no market of another language", () => {
    it.each([
      ["acme.com", ["FTC", "settlement"]],
      ["acme.co.uk", ["ICO fine", "settlement"]],
      ["acme.ie", ["DPC fine", "settlement"]],
      ["acme.com.au", ["OAIC", "settlement"]],
    ])(
      "adds the queries that name the authority of its jurisdiction after the English ones: %s",
      (domain, topics) => {
        expect(
          suggestedQueries({ ...ACME, domain }, ["legal_regulatory"]).legal_regulatory,
        ).toEqual([
          "Acme Analytics lawsuit",
          "Acme Analytics fined",
          ...topics.map((topic) => `Acme Analytics ${topic}`),
        ]);
      },
    );

    it("adds none for the security incidents", () => {
      expect(suggestedQueries({ ...ACME, domain: "acme.co.uk" }, ["security_incidents"])).toEqual({
        security_incidents: ["Acme Analytics data breach", "Acme Analytics security incident"],
      });
    });

    it("gives no two queries that the session would take for one, in any jurisdiction", () => {
      for (const domain of ["brume.com", "brume.co.uk", "brume.ie", "brume.com.au"]) {
        const target = { ...ACME, name: "Brume", domain, aliases: ["Cirrus"] };
        const queries = Object.values(suggestedQueries(target, RESEARCH_CATEGORIES))
          .flat()
          .map((query) => queryWords(query));

        for (let first = 0; first < queries.length; first += 1) {
          for (let second = first + 1; second < queries.length; second += 1) {
            expect(similarity(queries[first], queries[second])).toBeLessThan(
              REPEATED_QUERY_JACCARD,
            );
          }
        }
      }
    });
  });

  it("uses the name without its legal form", () => {
    const [first] = suggestedQueries({ ...ACME, name: "Müller GmbH" }, [
      "security_incidents",
    ]).security_incidents!;
    expect(first).toBe("Müller data breach");
  });

  describe("for a vendor with other names", () => {
    const WITH_ALIASES: ResearchTarget = { ...ACME, aliases: ["AcmeAI Ltd", "Acme Cloud"] };

    it("adds one query for each category, led by the first other name and the first topic of the category", () => {
      expect(suggestedQueries(WITH_ALIASES, ["security_incidents", "legal_regulatory"])).toEqual({
        security_incidents: [
          "Acme Analytics data breach",
          "Acme Analytics security incident",
          "AcmeAI data breach",
        ],
        legal_regulatory: [
          "Acme Analytics lawsuit",
          "Acme Analytics fined",
          "Acme Analytics FTC",
          "Acme Analytics settlement",
          "AcmeAI lawsuit",
        ],
      });
    });

    it("adds the query for layoffs of the first other name to the category of financial health", () => {
      expect(suggestedQueries(WITH_ALIASES, ["financial_health"])).toEqual({
        financial_health: [
          "Acme Analytics layoffs",
          "Acme Analytics bankruptcy",
          "Acme Analytics acquisition",
          "AcmeAI layoffs",
        ],
      });
    });

    it("adds the query for outages of the first other name to the category of availability", () => {
      expect(suggestedQueries(WITH_ALIASES, ["availability"])).toEqual({
        availability: ["Acme Analytics outage", "AcmeAI outage"],
      });
    });

    it("adds nothing for the categories that read the vendor's own website, or for no other name", () => {
      expect(suggestedQueries(WITH_ALIASES, ["certifications", "ai_specific"])).toEqual({});
      expect(suggestedQueries({ ...ACME, aliases: [] }, ["legal_regulatory"])).toEqual(
        suggestedQueries(ACME, ["legal_regulatory"]),
      );
    });
  });
});
