/**
 * The language a vendor's news is written in. The news feed answers a query in the language it is
 * written in, and a vendor in Germany, France or Italy is reported in German, French or Italian
 * first: the data protection authority of the country (the CNIL, the Garante, the AEPD, ...) tells
 * what it fined in its own language, and the English press reports only the larger cases. So, for
 * a vendor whose market is one of those below, the news categories are searched in that language
 * as well, with the words the local press uses and the name of the local authority.
 *
 * The market is read from the vendor's record and nothing else: the country a person stated for it
 * (spec Q1), else the country domain of its website (`acme.de`), else the legal form at the end of
 * its name (`Acme GmbH`). A stated country of an English-speaking jurisdiction (the United States,
 * the United Kingdom, Ireland, Australia) decides too: the vendor has no market, whatever its domain
 * or legal form say. A domain such as `.com` or `.io` says nothing of where a company is, and
 * neither does a legal form that exists in several countries (`S.A.`), so a vendor like that has no
 * market and is searched in English only.
 *
 * The feed is not asked for a market (`mkt`): a query in the local language already returns the
 * local news, and `mkt=de-DE` and `mkt=es-ES` were measured to return nothing for queries that
 * return results without it (see the roadmap, ruling R33).
 */
import {
  RESEARCH_CATEGORIES,
  type ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { shortName } from "./identity";
import type { ResearchTarget } from "./target";

export interface Market {
  /** The language, as the briefing names it. */
  language: string;
  /**
   * What to search after the vendor's name, for each category that searches the news: two
   * queries, of at most three words each (see MAX_TOPIC_WORDS in queries.ts), the first about the
   * data breach or the incident, the second about the lawsuit or the fine, with the name of the
   * authority that issues it where the press names it.
   */
  topics: Partial<Record<ResearchCategory, readonly string[]>>;
}

type MarketId = "de" | "fr" | "it" | "es" | "nl" | "pt" | "br";

const MARKETS: Readonly<Record<MarketId, Market>> = {
  de: {
    language: "German",
    topics: {
      security_incidents: ["Datenleck", "Cyberangriff"],
      legal_regulatory: ["Datenschutz Bußgeld", "Klage"],
    },
  },
  fr: {
    language: "French",
    topics: {
      security_incidents: ["fuite de données", "cyberattaque"],
      legal_regulatory: ["CNIL sanction", "plainte"],
    },
  },
  it: {
    language: "Italian",
    topics: {
      security_incidents: ["violazione dati", "attacco hacker"],
      legal_regulatory: ["Garante privacy sanzione", "causa"],
    },
  },
  es: {
    language: "Spanish",
    topics: {
      security_incidents: ["filtración de datos", "ciberataque"],
      legal_regulatory: ["AEPD multa", "demanda"],
    },
  },
  nl: {
    language: "Dutch",
    topics: {
      security_incidents: ["datalek", "hack"],
      legal_regulatory: ["Autoriteit Persoonsgegevens boete", "rechtszaak"],
    },
  },
  pt: {
    language: "Portuguese",
    topics: {
      security_incidents: ["violação de dados", "ciberataque"],
      legal_regulatory: ["CNPD coima", "processo"],
    },
  },
  br: {
    language: "Portuguese",
    topics: {
      security_incidents: ["vazamento de dados", "ataque hacker"],
      legal_regulatory: ["ANPD multa", "processo"],
    },
  },
};

/** The countries whose companies the press of a market reports on, as a person states them. */
const BY_COUNTRY: Readonly<Record<string, MarketId>> = {
  DE: "de",
  AT: "de",
  FR: "fr",
  IT: "it",
  ES: "es",
  NL: "nl",
  PT: "pt",
  BR: "br",
};

/** The country domains whose companies the press of a market reports on. */
const BY_COUNTRY_DOMAIN: Readonly<Record<string, MarketId>> = {
  de: "de",
  at: "de",
  fr: "fr",
  it: "it",
  es: "es",
  nl: "nl",
  pt: "pt",
  br: "br",
};

/** The legal forms of one market, by their letters: `S.r.l.` is `srl`. */
const BY_LEGAL_FORM: Readonly<Record<string, MarketId>> = {
  gmbh: "de",
  ag: "de",
  ug: "de",
  kg: "de",
  sas: "fr",
  sasu: "fr",
  sarl: "fr",
  srl: "it",
  spa: "it",
  sl: "es",
  slu: "es",
  bv: "nl",
  nv: "nl",
  lda: "pt",
  ltda: "br",
};

/** The last label of a domain: `de` for `acme.de` and `br` for `acme.com.br`. */
function countryDomainOf(domain: string | null): string | null {
  if (domain === null) return null;
  return domain.toLowerCase().split(".").pop() ?? null;
}

/** The legal form at the end of a name, by its letters; null for a name of one word. */
function legalFormOf(name: string): string | null {
  const words = name
    .trim()
    .split(/[\s,]+/)
    .filter((word) => word !== "");
  if (words.length < 2) return null;
  return words[words.length - 1].toLowerCase().replace(/[^\p{L}]/gu, "");
}

/**
 * What a table holds for a key. Only a key of the table itself: `constructor` is a word in a name
 * ("Site Constructor") and a label of a domain, and an object answers it with its own function.
 */
function lookup<T>(table: Readonly<Record<string, T>>, key: string | null): T | undefined {
  if (key === null || !Object.prototype.hasOwnProperty.call(table, key)) return undefined;
  return table[key];
}

/** The country a person stated for the vendor, or null. */
const statedCountryOf = (target: Pick<ResearchTarget, "identifiers">): string | null =>
  target.identifiers?.country ?? null;

/** The English-speaking jurisdictions whose authorities `regulatorTopicsOf` names. */
type Jurisdiction = "us" | "uk" | "ie" | "au";

/** The stated countries of those jurisdictions. */
const JURISDICTION_BY_COUNTRY: Readonly<Record<string, Jurisdiction>> = {
  US: "us",
  GB: "uk",
  IE: "ie",
  AU: "au",
};

/**
 * The market of a vendor, or null when its record says none: the stated country wins over the
 * country domain, which wins over the legal form. A stated country of an English-speaking
 * jurisdiction gives no market, whatever the domain and the legal form say; a stated country that
 * neither table knows changes nothing.
 */
export function marketOf(
  target: Pick<ResearchTarget, "name" | "domain" | "identifiers">,
): Market | null {
  const stated = statedCountryOf(target);
  if (lookup(JURISDICTION_BY_COUNTRY, stated) !== undefined) return null;
  const id =
    lookup(BY_COUNTRY, stated) ??
    lookup(BY_COUNTRY_DOMAIN, countryDomainOf(target.domain)) ??
    lookup(BY_LEGAL_FORM, legalFormOf(target.name));
  return id === undefined ? null : MARKETS[id];
}

/**
 * What to search after the vendor's name in the legal and regulatory news of a vendor that has no
 * market of another language: the authority that the press of its jurisdiction names, and the
 * word for a settlement. Measured on the news feed on 2026-10-28: `Adobe FTC` gave 8 items and
 * `Adobe settlement` 7, `Blackbaud settlement` 11 (the multistate deal of the attorneys general
 * among them), `Capita ICO fine` 11, `Meta DPC fine` 7 and `Optus OAIC` 11, where `fined` alone
 * gave none for Adobe or Blackbaud; a vendor with nothing on record gets none, which is no harm
 * (see the roadmap, ruling R35).
 */
const REGULATOR_TOPICS: Readonly<Record<Jurisdiction, readonly string[]>> = {
  us: ["FTC", "settlement"],
  uk: ["ICO fine", "settlement"],
  ie: ["DPC fine", "settlement"],
  au: ["OAIC", "settlement"],
};

/** The country domains of the jurisdictions above; every other vendor is searched as one of the United States. */
const JURISDICTION_BY_COUNTRY_DOMAIN: Readonly<Record<string, Jurisdiction>> = {
  uk: "uk",
  ie: "ie",
  au: "au",
};

/**
 * The topics that name the authority of the vendor's jurisdiction, for the legal and regulatory
 * news. None for a vendor in a market of another language: `localQueries` names its authority in
 * that language. The jurisdiction is read from the stated country, else from the country domain of
 * the website, and from nothing else; a domain such as `.com` says nothing of where a company is,
 * and the American authorities (the FTC, the state attorneys general) are the ones that fine most
 * companies that sell to American customers.
 */
export function regulatorTopicsOf(
  target: Pick<ResearchTarget, "name" | "domain" | "identifiers">,
): readonly string[] {
  if (marketOf(target) !== null) return [];
  const jurisdiction =
    lookup(JURISDICTION_BY_COUNTRY, statedCountryOf(target)) ??
    lookup(JURISDICTION_BY_COUNTRY_DOMAIN, countryDomainOf(target.domain)) ??
    "us";
  return REGULATOR_TOPICS[jurisdiction];
}

/** A search of the news in the language of the vendor's market. */
export interface LocalQuery {
  category: ResearchCategory;
  query: string;
  language: string;
}

/**
 * The searches to make in the language of the vendor's market, for the news categories that are
 * researched, in the order of the categories: the vendor's name (without its legal form, as an
 * article writes it) and the words of the market. None for a vendor with no market.
 */
export function localQueries(
  target: ResearchTarget,
  researchable: readonly ResearchCategory[],
): LocalQuery[] {
  const market = marketOf(target);
  if (market === null) return [];
  const name = shortName(target.name);
  return RESEARCH_CATEGORIES.filter((category) => researchable.includes(category)).flatMap(
    (category) =>
      (market.topics[category] ?? []).map((topic) => ({
        category,
        query: `${name} ${topic}`,
        language: market.language,
      })),
  );
}
