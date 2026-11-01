/**
 * The source registry v0: what code knows about the hosts that findings cite, with no model.
 *
 * Every entry is a judgment that a person made and can defend: a reason, the evidence it rests on,
 * the status of that evidence and the day it was reviewed. The entries are those of the spec's
 * D3.4 (`docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md`), with the two
 * additions of Ruling 9 of the M0 plan: the analysis and opinion path of `abc.net.au`, and an
 * entry of its own for `bing.com`, which today's aggregator list holds. Both can only lower a
 * label. Version sr-2 (2026-10-30) adds the answers of Q25 and Q26: the user content of G11 and of
 * the platforms of G6–G9, and the documents that others file with an authority (O20–O22).
 * Version sr-3 (2026-10-31) closes the other addresses of those documents that the final review
 * of M1 named: EDGAR's viewers, the portal's download host and CourtListener's document pages.
 * Version sr-4 (2026-10-31, M2) makes an EDGAR filing under the CIK a person stored for the vendor
 * the vendor's own word, in the archive and in the viewers (classify.ts, step 5).
 * Version sr-5 (2026-10-31) answers Q8, the government domains: the pattern that took any `gov`,
 * `govt`, `gouv`, `gob` or `gv` label before a country code for a government's is gone, since 87%
 * of the 1,240 names it matched were ordinary registrations. A government domain is official only
 * when a page of its registry, its regulator or its holder was read: `.mil` is now V, and
 * gov-sld-q8, gov-de-facto-q8, gov-held and gov-co hold the names that were read. govt.nz, go.ke,
 * go.ug, gov.ug and gov.ie have no entry, so their hosts are unknown until a person reads their
 * rule.
 * Version sr-5 also answers Q9, the trusted press, under a ruling on evidence (2026-10-31): a page
 * counts as evidence only when its site's robots.txt does not bar Anthropic's agents. The entries
 * bbc, theguardian, usatoday, cnbc, smh, bloomberg, washingtonpost, forbes, cbc, darkreading and
 * scworld take the reason, the evidence and the paths to downgrade that Q9 gives them, except that
 * the evidence of theguardian is its editorial code alone, since theguardian.com bars Claude-User.
 * thehackernews is unverified: no standards or corrections page of it was seen. npr, cnn, cnet,
 * axios and spiegel stay as sr-4 had them, whatever Q9 says, and so do the other 31 publishers
 * carried over, with their review of 2026-10-29.
 * Version sr-5 also widens rule V (2026-11-01), which says which pages of a vendor's own site are
 * its statements: the section is now read after `intl` and a locale and after `company`, `about`,
 * `about-us` or `corporate` (`/intl/en-us/legal`, `/company/trust`); `privacypolicy`,
 * `termsofservice`, `termsofuse` and `website-terms` count as sections; and a page with a section
 * of the newsroom (NEWSROOM_SECTIONS) is still never one.
 * Version sr-5 also answers Q28 (recommendation accepted 2026-10-31): the folder of an EDGAR
 * filing is every party's, so sr-4's rule is narrowed. A filing under the CIK a person stored for
 * the vendor is the vendor's own word only when the header of the filing names that CIK as a
 * filer, a filer on behalf of another or a reporting owner (edgarFiler.ts). A filing in which it is
 * only the subject company or the issuer, one in which it does not appear, and one whose filer
 * nobody asked or the SEC could not say, take the downgrade of the archive and the viewers that
 * every other filing has (classify.ts, steps 5 and 6). The records of the SEC's database keep
 * their strength (Q3), and the backfill, which makes no request, reads such a filing as unverified.
 *
 * An entry is added or changed only in a pull request that gives its reason, its evidence and a
 * review date, and every change gives the registry a new `REGISTRY_VERSION`, which a run stores so
 * that a label can be reproduced. A model never proposes, reads or decides an entry. The hygiene
 * test (`__tests__/entries.test.ts`) names the entries due for review at 12 months and fails on
 * one at 18.
 *
 * Evidence status: **V** the page that supports the reason was read; **P** the operator's own
 * pages were read, but they do not state one of the criteria; **S** only a search engine's summary
 * of the page was seen; **U** no page of the operator could be read.
 */
import type { SourceCategory } from "../../../domain.layer/interfaces/i.vendorResearch";

export const REGISTRY_VERSION = "sr-5";

/**
 * G1: the path segments that hold opinion, paid content or press releases on any trusted press
 * host. Each is used by at least one publisher of the registry for content that is not its own
 * reporting.
 */
export const GENERIC_DOWNGRADE_SEGMENTS: readonly string[] = [
  "opinion",
  "opinions",
  "sponsored",
  "sponsored-content",
  "partner-content",
  "paid-content",
  "brandstudio",
  "brand-studio",
  "adv",
  // Added after the final review of M0 (2026-10-30), UNVERIFIED: the publishers refuse automated
  // readers and no search showed these paths, so they come from public knowledge. AP News and
  // MarketWatch carry wire releases under the first two, The New York Times its paid posts under
  // the third and the Financial Times partner content under the last. A downgrade can only lower a
  // label.
  "press-release",
  "press-releases",
  "paidpost",
  "partnercontent",
];

/**
 * G1 by host: the first label of a subdomain on which a trusted publisher serves paid content.
 * `sponsored` is Bloomberg Media Studios (`sponsored.bloomberg.com`; S, the search results of
 * 2026-10-30 list its archive of sponsored articles at https://sponsored.bloomberg.com/archive),
 * `paidpost` the paid posts of The New York Times (`paidpost.nytimes.com`; S, named by a search
 * summary of Nieman Lab's report of 2014), and `partners` the branded content of The Wall Street
 * Journal (`partners.wsj.com`; UNVERIFIED, from public knowledge).
 */
export const GENERIC_DOWNGRADE_HOST_LABELS: readonly string[] = [
  "sponsored",
  "paidpost",
  "partners",
];

/**
 * Rule V (spec D5.4): the sections of a vendor's site where it states what binds it or reports
 * about itself. A page is one when its section is one of these words, alone or followed by `-`,
 * `_` or `.` (`/trust-center`, `/legal/ai-use`, `/privacy.html`), or when the first label of its
 * host is one of STATEMENT_HOST_LABELS. The section is the first segment of the path, after a
 * locale (`en`, `en-us`) or `intl` and a locale, and after `company`, `about`, `about-us` or
 * `corporate` when the path starts with one of them (`isStatementPage`, classify.ts).
 * `privacypolicy`, `termsofservice`, `termsofuse` and `website-terms` (sr-5) are the run-together
 * names that some sites give their policies and terms.
 */
export const STATEMENT_SECTIONS: readonly string[] = [
  "trust",
  "trustcenter",
  "security",
  "legal",
  "privacy",
  "privacypolicy",
  "terms",
  "termsofservice",
  "termsofuse",
  "website-terms",
  "tos",
  "policy",
  "policies",
  "compliance",
  "subprocessors",
  "sub-processors",
  "dpa",
  "gdpr",
  "status",
];

export const STATEMENT_HOST_LABELS: readonly string[] = ["trust", "security", "status"];

/**
 * G11 (Q25, added 2026-10-30): the first labels of a host, and the path segments, of community
 * forums, question boards and discussion threads, where users post. A page with one is user
 * content on any host, the vendor's own included, and so never the vendor's word.
 */
export const USER_CONTENT_HOST_LABELS: readonly string[] = [
  "community",
  "forum",
  "forums",
  "discuss",
  "discussions",
  "answers",
];

export const USER_CONTENT_SECTIONS: readonly string[] = USER_CONTENT_HOST_LABELS;

/**
 * The sections where a vendor announces: a page with one of these segments anywhere in its path
 * (`/en/blog/…`, `/company/news/…`, `/security/blog/…`) is never a statement, whatever else it is.
 * What a vendor announces of itself is a claim (rule V).
 */
export const NEWSROOM_SECTIONS: readonly string[] = [
  "blog",
  "blogs",
  "news",
  "newsroom",
  "press",
  "pressroom",
  "media",
  "stories",
];

/**
 * A part of a site that is not the publisher's own reporting. Paths are compared without regard to
 * case, by whole segments; the slug is the last segment of the path.
 */
export type DowngradeRule =
  /** A segment anywhere in the path. */
  | { pathSegment: string }
  /** The first segments of the path, unless they start with `unless`. */
  | { pathPrefix: string; unless?: string }
  | { slugPrefix: string }
  | { slugSuffix: string }
  | { slugContains: string }
  /** A host and its subdomains, and on them only the paths that start with `pathPrefix`. */
  | { host: string; pathPrefix?: string }
  /** The first segments of the path, where `#` stands for a segment of digits only. */
  | { pathSegments: readonly string[] };

export interface RegistryEntry {
  id: string;
  /** Registrable domains: a host matches itself and its subdomains. */
  hosts: readonly string[];
  /** The hosts are reviewed public suffixes, such as "gov.uk"; checked after every host entry. */
  suffix?: true;
  category: Exclude<SourceCategory, "vendor">;
  flags?: ReadonlyArray<"syndicated" | "blocked">;
  /**
   * How a copy is credited: by the page it names as its canonical address, when that is another
   * registry host (`canonical`), or as the issuer's own record (`issuer`, a court's judgment).
   */
  syndicatedFrom?: "canonical" | "issuer";
  /**
   * G3: the vendor's own word when a release carries an e-mail address on the vendor's domain,
   * else unverified (Q27).
   */
  wire?: true;
  /**
   * G6–G9: a platform where users publish. What is on it is user content, the vendor's own pages
   * included, except on the vendor's own subdomain of it (a blog at `acme.substack.com`) (Q25).
   */
  userContent?: true;
  downgrade?: readonly DowngradeRule[];
  /** The publisher's name, for display only: the key of independence is the entry id. */
  publisher?: string;
  reason: string;
  status: "V" | "P" | "S" | "U";
  evidence: readonly string[];
  reviewed: string;
}

/** The day every entry of sr-1 was reviewed. */
const REVIEWED = "2026-10-29";

/**
 * The day the entries of Q26 (O20–O22) were last reviewed: sr-2 added them on 2026-10-30, and sr-3
 * added the other addresses of their documents.
 */
const REVIEWED_SR3 = "2026-10-31";

/** The day the entries that sr-5 added or changed were reviewed. */
const REVIEWED_SR5 = "2026-10-31";

/** A trusted press entry whose publisher's pages could not be read: kept from today's list (Q9). */
const carriedOver = (id: string, hosts: readonly string[], publisher?: string): RegistryEntry => ({
  id,
  hosts,
  category: "trusted_press",
  ...(publisher === undefined ? {} : { publisher }),
  reason: "Carried over",
  status: "U",
  evidence: [],
  reviewed: REVIEWED,
});

const OFFICIAL: readonly RegistryEntry[] = [
  {
    id: "us-gov",
    hosts: ["gov"],
    suffix: true,
    category: "official",
    reason:
      "Only verified US government organisations: federal, state, territory, tribal and local",
    status: "V",
    evidence: ["https://get.gov/domains/eligibility/"],
    reviewed: REVIEWED,
  },
  {
    id: "us-mil",
    hosts: ["mil"],
    suffix: true,
    category: "official",
    reason:
      "US Department of Defense: run by the DoD Network Information Center, and its names fall within DoD jurisdiction",
    status: "V",
    evidence: [
      "https://www.iana.org/domains/root/db/mil.html",
      "https://www.rfc-editor.org/rfc/rfc2146.txt",
      "https://get.gov/",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "int",
    hosts: ["int"],
    suffix: true,
    category: "official",
    reason: "Intergovernmental organisations established by treaty",
    status: "V",
    evidence: ["https://www.iana.org/domains/int/policy"],
    reviewed: REVIEWED,
  },
  {
    id: "uk-gov",
    hosts: ["gov.uk", "gov.scot", "gov.wales"],
    suffix: true,
    category: "official",
    reason: "UK, Scottish and Welsh public sector only",
    status: "V",
    evidence: [
      "https://www.gov.uk/guidance/check-if-your-organisation-can-get-a-govuk-domain-name",
      "https://www.gov.scot/publications/govscot-domains/",
      "https://www.gov.wales/policy-registering-and-running-llywcymru-and-govwales-domains-html",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "fr-gouv",
    hosts: ["gouv.fr"],
    suffix: true,
    category: "official",
    reason: "Reserved for the French government (Afnic naming charter, art. 2.5)",
    status: "V",
    evidence: [
      "https://www.afnic.fr/wp-media/uploads/2026/07/afnic-charte-de-nommage-06-07-2026.pdf",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "europa",
    hosts: ["europa.eu"],
    suffix: true,
    category: "official",
    reason: "Mainly EU institutions, bodies and agencies; exceptions need approval",
    status: "V",
    evidence: [
      "https://commission.europa.eu/resources/europa-web-guide/governance-europa-domain/europa-domain-and-subdomains/europa-domain-and-subdomains-overview_en",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "gov-sld",
    hosts: ["gov.au", "gov.in", "gob.es", "gob.mx", "go.jp", "go.kr"],
    suffix: true,
    category: "official",
    reason: "Government second-level domains restricted by their registries",
    status: "V",
    evidence: [
      "https://www.auda.org.au/au-domain-names/the-different-au-domain-names/gov-au-domain-names/",
      "https://registry.gov.in/pdfdocs/Gov.In_Guidelines.pdf",
      "https://www.boe.es/eli/es/o/2005/05/19/itc1542",
      "https://www.dominios.mx/dominios-gob-mx/",
      "https://jprs.jp/about/jp-dom/spec/",
      "https://krnic.or.kr/jsp/resources/domainInfo/krDomainInfo.jsp",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "gov-de-facto",
    hosts: ["admin.ch", "canada.ca", "gv.at"],
    suffix: true,
    category: "official",
    reason:
      "Government domains by directive or design standard; gv.at may delegate subdomains to bodies acting in the public interest",
    status: "V",
    evidence: [
      "https://www.bk.admin.ch/dam/de/sd-web/4fzFM2z1Gl9F/i003_2_1_d.pdf",
      "https://design.canada.ca/specifications/mandatory-elements/domains-urls.html",
      "https://ref.gv.at/ag-resi-internetdomainverwaltung-gv.at-naming-und-domainregistrierungs-policy",
    ],
    reviewed: REVIEWED,
  },
  // Q8 (sr-5): the four entries below replace gov-unverified, which took the carried-over hosts and
  // every `gov`, `govt`, `gouv`, `gob` or `gv` label before a country code for a government's. A
  // name is here only when a page of its registry, its regulator or its holder was read, and they
  // are kept apart from gov-sld and gov-de-facto so that the review dates of those two are not
  // reset. govt.nz, go.ke, go.ug, gov.ug and gov.ie are not here: nothing was read that states who
  // may hold a name under them, so their hosts are unknown.
  {
    // The registry's list for gov.br says federal institutions; the states' zones under it
    // (sp.gov.br) are state governments, whose own rule was not read.
    id: "gov-sld-q8",
    hosts: [
      "gov.br",
      "go.id",
      "go.th",
      "go.tz",
      "gov.sg",
      "gov.my",
      "gov.pk",
      "gob.pk",
      "gov.lk",
      "gov.za",
      "gov.pl",
      "gov.hk",
      "gob.gt",
    ],
    suffix: true,
    category: "official",
    reason:
      "Government second-level domains restricted by their registries or regulators: gov.br to federal institutions, go.id to state institutions, go.th to government agencies, go.tz to government entities, gov.sg to government bodies, gov.my to government organisations, gov.pk to the Federal Government of Pakistan, gob.pk to the Government of Balochistan, gov.lk to government organisations and departments, gov.za to government entities, gov.pl to public authorities (not municipalities), professional self-government bodies and units under the Prime Minister or ministers, gov.hk to bureaux and departments of the HKSAR Government, gob.gt to government agencies",
    status: "V",
    evidence: [
      "https://registro.br/dominio/categorias/",
      "https://www.cgi.br/resolucoes/documento/2017/031",
      "https://pandi.id/public/files/2024/2/a-pm-232013-pengelolaan-nama-domain-1709175239.pdf",
      "https://pandi.id/public/files/2024/2/a-pm-052015-registrar-nama-domain-instansi-penyelenggara-negara-1709175259.pdf",
      "https://pandi.id/public/files/2024/10/kebijakan-pendaftaran-nama-domain-versi-9-0-bilingual-new-1729151599.pdf",
      "https://www.thnic.co.th/gov",
      "https://www.tcra.go.tz/faq",
      "https://www.iana.org/domains/root/db/tz.html",
      "https://www.sgnic.sg/domain-registration/sg-categories-rules",
      "https://mynic.my/resources/domains/buying-a-domain",
      "https://www.pknic.net.pk/gov-requirements.html",
      "https://www.domains.lk/lk-domain-naming-structure/",
      "https://zadna.org.za/nic-home",
      "https://www.dns.pl/informacje_o_rejestracji_domen_gov_pl",
      "https://www.hkirc.hk/en/our-services-support/domain-services/eligibility-required-documents/",
      "https://www.gt/sitio/registration_policy.php?lang=en",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "gov-de-facto-q8",
    hosts: ["gc.ca", "gov.de"],
    suffix: true,
    category: "official",
    reason:
      "Government domains held by the state itself: gc.ca is held by Shared Services Canada, and new subdomains go through the government's Central Domain Registry Service; gov.de is allocated under control to federal, state and local services by the federal digital ministry's Digitale Dachmarke",
    status: "V",
    evidence: [
      "https://www.canada.ca/en/government/system/digital-government/policies-standards/enterprise-it-service-common-configurations/dns.html",
      "https://rdap.ca.fury.ca/rdap/domain/gc.ca",
      "https://design.canada.ca/specifications/mandatory-elements/domains-urls.html",
      "https://dachmarke.gov.de/",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "gov-held",
    hosts: ["bund.de", "gov.fi"],
    suffix: true,
    category: "official",
    reason:
      "Domains that a national government holds, with no rule on who gets names under them read: bund.de, whose portal is published by a federal ministry, and gov.fi, which the registry records as held by the Finnish Prime Minister's Office",
    status: "P",
    evidence: [
      "https://verwaltung.bund.de/portal/EN/impressum",
      "https://www.bund.de/",
      "https://rdap.fi/rdap/rdap/domain/gov.fi",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "gov-co",
    hosts: ["gov.co"],
    suffix: true,
    category: "official",
    reason:
      "Restricted .CO name for Colombian institutions, registered on supporting documents (operator Puntoco); government-only is not stated",
    status: "P",
    evidence: ["https://www.registrocolombia.co/"],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "ico",
    hosts: ["ico.org.uk"],
    category: "official",
    reason: "UK Information Commissioner's Office, the data protection regulator",
    status: "V",
    evidence: ["https://ico.org.uk/action-weve-taken/enforcement/"],
    reviewed: REVIEWED,
  },
  {
    id: "cnil",
    hosts: ["cnil.fr"],
    category: "official",
    reason: "CNIL, the French data protection authority",
    status: "V",
    evidence: ["https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil"],
    reviewed: REVIEWED,
  },
  {
    id: "fca",
    hosts: ["fca.org.uk"],
    category: "official",
    reason: "Financial Conduct Authority (carried over)",
    status: "U",
    evidence: [],
    reviewed: REVIEWED,
  },
  {
    id: "bafin",
    hosts: ["bafin.de"],
    category: "official",
    reason: "BaFin (carried over)",
    status: "U",
    evidence: [],
    reviewed: REVIEWED,
  },
  {
    id: "dpas",
    hosts: [
      "garanteprivacy.it",
      "aepd.es",
      "dataprotection.ie",
      "autoriteitpersoonsgegevens.nl",
      "cnpd.pt",
      "datatilsynet.no",
      "datatilsynet.dk",
      "imy.se",
    ],
    category: "official",
    reason: "National data protection authorities (carried over)",
    status: "U",
    evidence: [],
    reviewed: REVIEWED,
  },
  {
    id: "uk-courts",
    hosts: ["supremecourt.uk", "judiciary.uk"],
    category: "official",
    reason: "UK courts (carried over)",
    status: "U",
    evidence: [],
    reviewed: REVIEWED,
  },
  {
    id: "un",
    // With main.un.org and scsanctions.un.org, which are its subdomains.
    hosts: ["un.org"],
    category: "official",
    reason: "United Nations; added in sr-1",
    status: "V",
    evidence: ["https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list"],
    reviewed: REVIEWED,
  },
  {
    id: "cve",
    hosts: ["cve.org"],
    category: "official",
    reason: "The CVE Program, sponsored by CISA; added in sr-1",
    status: "V",
    evidence: ["https://www.cve.org/Legal/TermsOfUse"],
    reviewed: REVIEWED,
  },
  {
    id: "worldbank",
    hosts: ["worldbank.org"],
    category: "official",
    reason:
      "World Bank Group, which publishes its debarments; added in sr-1 (its intergovernmental status was not checked)",
    status: "P",
    evidence: ["https://www.worldbank.org/en/projects-operations/procurement/debarred-firms"],
    reviewed: REVIEWED,
  },
  {
    id: "bailii",
    hosts: ["bailii.org"],
    category: "official",
    flags: ["syndicated"],
    syndicatedFrom: "issuer",
    reason:
      "A registered charity that republishes judgments supplied by courts; the court is the publisher",
    status: "V",
    evidence: ["https://www.bailii.org/bailii/"],
    reviewed: REVIEWED,
  },
  {
    id: "courtlistener",
    hosts: ["courtlistener.com"],
    category: "official",
    flags: ["syndicated"],
    syndicatedFrom: "issuer",
    // Q26: the RECAP archive's documents, gathered from PACER, are the parties' filings. The status
    // of the path is P: the RECAP page describes the links, not every document behind them. A
    // docket is at /docket/<id>/<slug>/ (V: the API's absolute_url); a document's page at
    // /docket/<id>/<number>/<slug>/ and an attachment's one number deeper are UNVERIFIED shapes,
    // named by the final review of M1, and a rule that matches nothing lowers nothing.
    downgrade: [
      { host: "storage.courtlistener.com", pathPrefix: "recap" },
      { pathSegments: ["docket", "#", "#"] },
    ],
    reason:
      "Free Law Project, a non-profit that republishes court opinions and dockets; a party's filing on it is an allegation, not a finding, and the documents its RECAP archive gathers from PACER are such filings",
    status: "V",
    evidence: [
      "https://free.law/about/",
      "https://www.courtlistener.com/help/",
      "https://free.law/recap/hacking-recap-links",
      "https://wiki.free.law/c/courtlistener/help/api/rest/v4/pacer-data",
    ],
    reviewed: REVIEWED_SR3,
  },
  {
    // O21 (Q26). The status of the path is P: EDGAR's filings are under /Archives/edgar/data/. The
    // viewers that show a filing (/ix?doc=, /ixviewer/, /cgi-bin/viewer) are UNVERIFIED shapes,
    // named by the final review of M1: the SEC's pages say only that an inline viewer exists.
    id: "sec",
    hosts: ["sec.gov"],
    category: "official",
    downgrade: [
      { pathPrefix: "Archives" },
      { pathPrefix: "ix" },
      { pathPrefix: "ixviewer" },
      { pathPrefix: "cgi-bin/viewer" },
    ],
    reason:
      "The Securities and Exchange Commission; its own releases and orders are its word, while a filing in EDGAR (under /Archives/edgar/data/) is the filer's document",
    status: "V",
    evidence: ["https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data"],
    reviewed: REVIEWED_SR3,
  },
  {
    // O22 (Q26). The status of the path is U: no page of the portal could be read, and the shape
    // of a comment's address comes from the API's documentation and search results. The files on
    // the download host (UNVERIFIED: the API names only an S3 address) are unverified whatever
    // they are, since nothing tells a comment's attachment from an agency's file.
    id: "regulations-gov",
    hosts: ["regulations.gov"],
    category: "official",
    downgrade: [{ pathPrefix: "comment" }, { host: "downloads.regulations.gov" }],
    reason:
      "The federal rulemaking portal; the documents agencies post there are theirs, a public comment is its author's",
    status: "P",
    evidence: ["https://open.gsa.gov/api/regulationsgov/"],
    reviewed: REVIEWED_SR3,
  },
];

const TRUSTED_PRESS: readonly RegistryEntry[] = [
  {
    id: "reuters",
    hosts: ["reuters.com"],
    category: "trusted_press",
    publisher: "Reuters",
    reason:
      "News agency under the Thomson Reuters Trust Principles (independence, integrity, freedom from bias); no corrections policy on that page",
    status: "P",
    evidence: ["https://www.thomsonreuters.com/en/about-us/trust-principles"],
    reviewed: REVIEWED,
  },
  carriedOver("apnews", ["apnews.com"], "AP"),
  {
    id: "bbc",
    hosts: ["bbc.com", "bbc.co.uk"],
    category: "trusted_press",
    publisher: "BBC",
    reason:
      "News pages link to an editorial complaints route and the BBC's editorial guidelines, and name a publishing-principles page; the guidelines themselves could not be read",
    status: "P",
    evidence: ["https://www.bbc.co.uk/news/articles/c629pny4gl7o"],
    reviewed: REVIEWED_SR5,
  },
  carriedOver("nytimes", ["nytimes.com"]),
  carriedOver("wsj", ["wsj.com"]),
  carriedOver("ft", ["ft.com"]),
  {
    id: "bloomberg",
    hosts: ["bloomberg.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "sponsor" }, { pathSegment: "sponsors" }],
    reason:
      "A standards inbox for corrections; The Bloomberg Way guide for reporters and editors (search summary only)",
    status: "S",
    evidence: [
      "https://www.bloomberg.com/help/question/submit-feedback-news-coverage/",
      "https://www.bloomberg.com/robots.txt",
    ],
    reviewed: REVIEWED_SR5,
  },
  carriedOver("economist", ["economist.com"]),
  {
    id: "theguardian",
    hosts: ["theguardian.com"],
    category: "trusted_press",
    publisher: "The Guardian",
    downgrade: [{ pathSegment: "commentisfree" }],
    reason:
      "GNM editorial code: significant errors are corrected promptly through the readers' editor, the code binds external contributors too, and commercial teams make paid content; Opinion sits under /commentisfree",
    status: "V",
    // The code only: theguardian.com bars Claude-User, so the article q9 cited is not evidence.
    evidence: [
      "https://uploads.guim.co.uk/2026/03/03/Editorial_Code_of_Practice_Guidelines_March2026.pdf",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "washingtonpost",
    hosts: ["washingtonpost.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "creativegroup" }],
    reason:
      "Policies and standards: every error is corrected and the correction says what was wrong (search summary only)",
    status: "S",
    evidence: [
      "https://www.washingtonpost.com/policies-and-standards/",
      "https://www.washingtonpost.com/robots.txt",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "cnn",
    hosts: ["cnn.com"],
    category: "trusted_press",
    reason: "About page; corrections policy not seen",
    status: "S",
    evidence: ["https://www.cnn.com/about"],
    reviewed: REVIEWED,
  },
  {
    id: "nbcnews",
    hosts: ["nbcnews.com"],
    category: "trusted_press",
    reason: "About and contact pages: an address for error reports, no corrections policy stated",
    status: "P",
    evidence: ["https://www.nbcnews.com/information/nbc-news-info/about-nbc-news-digital-n1232178"],
    reviewed: REVIEWED,
  },
  {
    id: "cbsnews",
    hosts: ["cbsnews.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "brandstudio" }, { slugContains: "-paid-content" }],
    reason:
      "Publishing principles with a corrections policy; brand studio content is labelled and made without the newsroom",
    status: "V",
    evidence: [
      "https://www.cbsnews.com/news/cbs-news-publishing-principles/",
      "https://www.cbsnews.com/brandstudio/",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "abcnews",
    hosts: ["abcnews.go.com", "abcnews.com"],
    category: "trusted_press",
    publisher: "ABC News",
    reason: "Contact page and footer only; abcnews.go.com redirects to abcnews.com (added host)",
    status: "P",
    evidence: ["https://abcnews.com/Contact"],
    reviewed: REVIEWED,
  },
  {
    id: "npr",
    hosts: ["npr.org"],
    category: "trusted_press",
    reason: "Ethics handbook: errors of fact are corrected, with no silent fixes",
    status: "S",
    evidence: ["https://www.npr.org/ethics"],
    reviewed: REVIEWED,
  },
  {
    id: "pbs",
    hosts: ["pbs.org"],
    category: "trusted_press",
    reason: "Standards memo on issuing corrections",
    status: "V",
    evidence: ["https://www.pbs.org/standards/blogs/standards-memos/issuing-corrections/"],
    reviewed: REVIEWED,
  },
  {
    id: "usatoday",
    hosts: ["usatoday.com"],
    category: "trusted_press",
    publisher: "USA TODAY",
    reason:
      "USA TODAY NETWORK ethical principles for newsrooms: accuracy, fairness and independence; errors are corrected promptly and transparently; advertising is kept apart from editorial content",
    status: "V",
    evidence: ["https://cm.marconews.com/ethical-conduct/"],
    reviewed: REVIEWED_SR5,
  },
  carriedOver("latimes", ["latimes.com"]),
  {
    id: "time",
    hosts: ["time.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "partner-content" }],
    reason:
      "A corrections section on its about page; branded and sponsored content is made apart from the newsroom",
    status: "V",
    evidence: ["https://time.com/6268426/about-time/"],
    reviewed: REVIEWED,
  },
  carriedOver("theatlantic", ["theatlantic.com"]),
  carriedOver("newyorker", ["newyorker.com"]),
  {
    id: "axios",
    hosts: ["axios.com"],
    category: "trusted_press",
    reason: "Ethics page",
    status: "S",
    evidence: ["https://www.axios.com/about/ethics"],
    reviewed: REVIEWED,
  },
  {
    id: "cnbc",
    hosts: ["cnbc.com"],
    category: "trusted_press",
    publisher: "CNBC",
    downgrade: [{ pathSegment: "advertorial" }, { pathSegment: "guest-blog" }],
    reason:
      "Publishes correction notices under 'CNBC News Corrections', linked from every footer; advertorials are labelled paid posts made without the editorial staff",
    status: "V",
    evidence: [
      "https://www.cnbc.com/correction-where-big-money-investors-are-putting-their-fixed-income-dollars/",
      "https://www.cnbc.com/corrections/",
      "https://www.cnbc.com/advertorial/2022/02/17/understanding-the-value-of-branded-content.html",
      "https://www.cnbc.com/guest-blog/",
    ],
    reviewed: REVIEWED_SR5,
  },
  carriedOver("marketwatch", ["marketwatch.com"]),
  carriedOver("barrons", ["barrons.com"]),
  {
    id: "forbes",
    hosts: ["forbes.com"],
    category: "trusted_press",
    downgrade: [
      { pathPrefix: "sites", unless: "sites/forbesstaff" },
      { host: "councils.forbes.com" },
      { pathSegment: "councils" },
      { pathSegment: "advisor" },
      { pathSegment: "vetted" },
    ],
    reason:
      "Editorial values and standards: corrections when warranted, fact-checking, rules binding staff and contributors; BrandVoice, Councils, Advisor and Vetted listed as partner content",
    status: "V",
    evidence: [
      "https://www.forbes.com/sites/forbesstaff/article/forbes-editorial-values-and-standards/",
      "https://councils.forbes.com/",
      "https://www.forbes.com/robots.txt",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "fortune",
    hosts: ["fortune.com"],
    category: "trusted_press",
    reason: "About page; no standards or corrections page found",
    status: "P",
    evidence: ["https://fortune.com/about-us/"],
    reviewed: REVIEWED,
  },
  {
    ...carriedOver("politico", ["politico.com", "politico.eu"], "Politico"),
    reason: "Carried over; today's publisher key already counts the two hosts as one",
  },
  {
    id: "euronews",
    hosts: ["euronews.com"],
    category: "trusted_press",
    reason:
      "Editorial charter (2012): important errors are corrected clearly and quickly; partner content is labelled",
    status: "V",
    evidence: [
      "https://static.euronews.com/media/download/press-conference/Editorial-Charter-EN-27-04-12.pdf",
    ],
    reviewed: REVIEWED,
  },
  carriedOver("euractiv", ["euractiv.com"]),
  {
    id: "aljazeera",
    hosts: ["aljazeera.com"],
    category: "trusted_press",
    downgrade: [
      { pathSegment: "opinion" },
      { pathSegment: "sponsored" },
      { pathSegment: "paid-content" },
    ],
    reason: "Code of ethics: mistakes are acknowledged and corrected promptly",
    status: "V",
    evidence: ["https://www.aljazeera.com/code-of-ethics"],
    reviewed: REVIEWED,
  },
  carriedOver("dw", ["dw.com"]),
  {
    id: "france24",
    hosts: ["france24.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "sponsored-content" }],
    reason: "France Médias Monde's corrections policy",
    status: "V",
    evidence: [
      "https://www.francemediasmonde.com/fr/wp-content/uploads/2024/05/Charte-de-rectification-FMM.pdf",
    ],
    reviewed: REVIEWED,
  },
  carriedOver("independent", ["independent.co.uk"]),
  carriedOver("telegraph", ["telegraph.co.uk"]),
  carriedOver("thetimes", ["thetimes.co.uk"]),
  {
    id: "sky-news",
    hosts: ["news.sky.com"],
    category: "trusted_press",
    publisher: "Sky News",
    reason:
      "Sky's page says editorial guidelines exist (the guidelines could not be read); corrections not stated",
    status: "P",
    evidence: ["https://www.skygroup.sky/what-we-do/unmissable-tv/news"],
    reviewed: REVIEWED,
  },
  {
    id: "cbc",
    hosts: ["cbc.ca"],
    category: "trusted_press",
    reason:
      "CBC/Radio-Canada Journalistic Standards and Practices: significant errors are corrected promptly, with an explanatory note on the story page online",
    status: "V",
    evidence: [
      "https://cbc.radio-canada.ca/en/vision/governance/journalistic-standards-and-practices/corrections",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "theglobeandmail",
    hosts: ["theglobeandmail.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "opinion" }, { pathSegment: "adv" }],
    reason: "Editorial code: corrections are published",
    status: "V",
    evidence: ["https://www.theglobeandmail.com/about/editorial-code/"],
    reviewed: REVIEWED,
  },
  {
    id: "abc",
    hosts: ["abc.net.au"],
    category: "trusted_press",
    publisher: "ABC Australia",
    // Ruling 9(a): ABC's policy separates analysis and opinion from its factual reporting.
    downgrade: [{ pathPrefix: "news/analysis-and-opinion" }],
    reason: "Editorial policy on corrections and clarifications",
    status: "V",
    evidence: [
      "https://www.abc.net.au/edpols/corrections-and-clarifications/13644514",
      "https://www.abc.net.au/edpols/differentiating-between-factual-reporting-analysis-and-opinion/13644726",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "smh",
    hosts: ["smh.com.au"],
    category: "trusted_press",
    reason:
      "Nine's governance page: Nine observes the Charter of Editorial Independence for its mastheads, The Sydney Morning Herald among them, and its Metro Publishing business is a member of the Press Council of Australia",
    status: "V",
    evidence: ["https://www.nineforbrands.com.au/governance/"],
    reviewed: REVIEWED_SR5,
  },
  carriedOver("straitstimes", ["straitstimes.com"]),
  {
    id: "scmp",
    hosts: ["scmp.com"],
    category: "trusted_press",
    reason:
      "Policies and standards: errors are corrected quickly, clearly and openly; advertising and branded content are labelled",
    status: "V",
    evidence: ["https://www.scmp.com/policies-and-standards"],
    reviewed: REVIEWED,
  },
  {
    id: "nikkei",
    hosts: ["nikkei.com"],
    category: "trusted_press",
    reason: "Nikkei's editorial principles (accuracy, fairness); no corrections clause",
    status: "P",
    evidence: ["https://www.nikkei.co.jp/nikkeiinfo/r-c/"],
    reviewed: REVIEWED,
  },
  carriedOver("thehindu", ["thehindu.com"]),
  carriedOver("lemonde", ["lemonde.fr"]),
  carriedOver("lefigaro", ["lefigaro.fr"]),
  {
    id: "spiegel",
    hosts: ["spiegel.de"],
    category: "trusted_press",
    reason: "Spiegel group's standards page; corrections not seen",
    status: "S",
    evidence: ["https://www.spiegelgruppe.de/journalismus/standards-im-journalismus"],
    reviewed: REVIEWED,
  },
  carriedOver("zeit", ["zeit.de"]),
  carriedOver("faz", ["faz.net"]),
  carriedOver("sueddeutsche", ["sueddeutsche.de"]),
  {
    id: "handelsblatt",
    hosts: ["handelsblatt.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "adv" }, { pathSegment: "meinung" }],
    reason: "Guidelines: errors are corrected as fast as possible; advertising is labelled",
    status: "V",
    evidence: ["https://www.handelsblatt.com/richtlinien/"],
    reviewed: REVIEWED,
  },
  {
    id: "heise",
    hosts: ["heise.de"],
    category: "trusted_press",
    reason: "Imprint and contact pages; no standards page found",
    status: "P",
    evidence: [],
    reviewed: REVIEWED,
  },
  {
    id: "golem",
    hosts: ["golem.de"],
    category: "trusted_press",
    reason: "Mission statement: a four-eyes check before publication; no corrections clause",
    status: "P",
    evidence: ["https://www.golem.de/sonstiges/leitbild.html"],
    reviewed: REVIEWED,
  },
  carriedOver("elpais", ["elpais.com"]),
  carriedOver("corriere", ["corriere.it"]),
  carriedOver("repubblica", ["repubblica.it"]),
  carriedOver("nrc", ["nrc.nl"]),
  {
    id: "techcrunch",
    hosts: ["techcrunch.com"],
    category: "trusted_press",
    downgrade: [
      { pathSegment: "sponsored" },
      { pathSegment: "sponsor" },
      { pathSegment: "brand-studio" },
    ],
    reason:
      "About page names its editors and reporters; corrections not stated; sponsored partner content is labelled",
    status: "P",
    evidence: ["https://techcrunch.com/about-techcrunch/", "https://techcrunch.com/sponsored/"],
    reviewed: REVIEWED,
  },
  carriedOver("theverge", ["theverge.com"]),
  carriedOver("wired", ["wired.com"]),
  carriedOver("arstechnica", ["arstechnica.com"]),
  carriedOver("zdnet", ["zdnet.com"]),
  carriedOver("cnet", ["cnet.com"]),
  {
    id: "venturebeat",
    hosts: ["venturebeat.com"],
    category: "trusted_press",
    // Guest articles.
    downgrade: [{ pathPrefix: "category/DataDecisionMakers" }],
    reason:
      "Ethics statement: mistakes are admitted and corrected promptly; sponsored posts are labelled",
    status: "V",
    evidence: ["https://venturebeat.com/ethics-statement"],
    reviewed: REVIEWED,
  },
  {
    id: "theinformation",
    hosts: ["theinformation.com"],
    category: "trusted_press",
    reason:
      "About page: no outside owners, sponsorships disclosed; corrections not stated; partner content sits under the same path as news",
    status: "P",
    evidence: ["https://www.theinformation.com/about"],
    reviewed: REVIEWED,
  },
  {
    id: "theregister",
    hosts: ["theregister.com"],
    category: "trusted_press",
    downgrade: [
      { host: "vendorvoice.theregister.com" },
      { slugPrefix: "sponsored-" },
      { slugPrefix: "partner-content-" },
    ],
    reason: "Contact page: errors go to the editor on duty",
    status: "V",
    evidence: ["https://www.theregister.com/Profile/contact/"],
    reviewed: REVIEWED,
  },
  {
    id: "bleepingcomputer",
    hosts: ["bleepingcomputer.com"],
    category: "trusted_press",
    downgrade: [{ pathPrefix: "offer/deals" }, { host: "deals.bleepingcomputer.com" }],
    reason: "Ethics statement with a corrections section; sponsored posts are labelled",
    status: "V",
    evidence: ["https://www.bleepingcomputer.com/ethics-statement/"],
    reviewed: REVIEWED,
  },
  {
    id: "therecord",
    hosts: ["therecord.media"],
    category: "trusted_press",
    reason:
      "About page: inaccurate stories are updated with a disclosure; owned by Recorded Future and states its editorial independence",
    status: "V",
    evidence: ["https://therecord.media/about"],
    reviewed: REVIEWED,
  },
  {
    id: "securityweek",
    hosts: ["securityweek.com"],
    category: "trusted_press",
    reason:
      "Content by industry professionals and a news team; contributor articles carry no marker; corrections not stated",
    status: "P",
    evidence: [
      "https://advertise.securityweek.com/info",
      "https://www.securityweek.com/industry-contributors/",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "darkreading",
    hosts: ["darkreading.com"],
    category: "trusted_press",
    reason:
      "Owner Informa TechTarget's editorial page: its editorial content, Dark Reading's network included, is vendor-neutral and apart from business ties; corrections not stated",
    status: "P",
    evidence: [
      "https://www.informatechtarget.com/editorial/",
      "https://www.darkreading.com/about-us",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "scworld",
    hosts: ["scworld.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "perspective" }],
    reason:
      "Owner CyberRisk Alliance's editorial policy: errors are corrected promptly and openly, sponsored content is clearly identified; outside contributors write Perspectives",
    status: "V",
    evidence: [
      "https://cyberriskalliance.com/editorial-policy",
      "https://www.cyberriskalliance.com/why-cra",
      "https://www.cyberriskalliance.com/",
      "https://www.scworld.com/contribute",
    ],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "cyberscoop",
    hosts: ["cyberscoop.com"],
    category: "trusted_press",
    downgrade: [{ pathPrefix: "news/sponsored-content" }, { slugSuffix: "-op-ed" }],
    reason: "Sponsored content is made by a studio apart from the editorial department",
    status: "P",
    evidence: ["https://cyberscoop.com/about-us/"],
    reviewed: REVIEWED,
  },
  {
    id: "helpnetsecurity",
    hosts: ["helpnetsecurity.com"],
    category: "trusted_press",
    downgrade: [{ slugPrefix: "product-showcase-" }],
    reason:
      "Independent since 1998; many contributors are industry leaders; corrections not stated",
    status: "P",
    evidence: ["https://www.helpnetsecurity.com/about-us/"],
    reviewed: REVIEWED,
  },
  {
    id: "infosecurity-magazine",
    hosts: ["infosecurity-magazine.com"],
    category: "trusted_press",
    downgrade: [{ pathSegment: "opinions" }, { pathSegment: "op-ed" }],
    reason: "Guest articles from industry professionals; corrections not stated",
    status: "P",
    evidence: [
      "https://www.infosecurity-magazine.com/the-magazine/",
      "https://www.infosecurity-magazine.com/op-ed/",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "bankinfosecurity",
    hosts: ["bankinfosecurity.com"],
    category: "trusted_press",
    reason: "Published by ISMG, which sells sponsored editorial; no corrections policy stated",
    status: "P",
    evidence: ["https://www.bankinfosecurity.com/about-us", "https://ismg.io/content/"],
    reviewed: REVIEWED,
  },
  {
    id: "iapp",
    hosts: ["iapp.org"],
    category: "trusted_press",
    reason:
      "A policy-neutral association; contributed opinion shares the paths of staff news; corrections not stated",
    status: "P",
    evidence: ["https://iapp.org/news/write-for-us"],
    reviewed: REVIEWED,
  },
];

const UNVERIFIED: readonly RegistryEntry[] = [
  {
    id: "krebsonsecurity",
    hosts: ["krebsonsecurity.com"],
    category: "unverified",
    reason:
      "A single author's blog; no editorial oversight or corrections policy shown — unverified (Q10)",
    status: "P",
    evidence: ["https://krebsonsecurity.com/about/"],
    reviewed: REVIEWED,
  },
  {
    // Q9 (sr-5): moved here from the trusted press. No standards or corrections page was seen, and
    // the site bars automated readers. An unverified entry has nothing to be lowered from, so the
    // downgrade rule it had is gone.
    id: "thehackernews",
    hosts: ["thehackernews.com"],
    category: "unverified",
    reason:
      "No standards or corrections page seen; a search summary shows partner-contributed and sponsored articles; the site blocks automated readers",
    status: "S",
    evidence: ["https://thehackernews.com/p/about-us.html", "https://thehackernews.com/robots.txt"],
    reviewed: REVIEWED_SR5,
  },
  {
    id: "wires",
    hosts: [
      "prnewswire.com",
      "einpresswire.com",
      "prweb.com",
      "24-7pressrelease.com",
      "openpr.com",
      "businesswire.com",
      "globenewswire.com",
      "accesswire.com",
    ],
    category: "unverified",
    wire: true,
    reason:
      "Paid distribution of releases written by the issuer; PRWeb says it does not verify what customers submit",
    status: "V",
    evidence: [
      "https://www.prnewswire.com/pr-distribution-and-placement/",
      "https://www.einpresswire.com/editorial-guidelines",
      "https://www.prweb.com/legal/",
      "https://www.24-7pressrelease.com/content_guidelines",
      "https://www.openpr.com/news/about.html",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "republishers",
    hosts: ["msn.com", "yahoo.com", "newsbreak.com"],
    category: "unverified",
    flags: ["syndicated"],
    syndicatedFrom: "canonical",
    reason:
      "Show partner publishers' articles: MSN shows the publisher's logo and usually leaves the work unchanged; Yahoo displays content it did not create; publishers license NewsBreak to publish",
    status: "V",
    evidence: [
      "https://support.microsoft.com/en-us/msn",
      "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
      "https://publishers.newsbreak.com/legal",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "aggregators",
    hosts: [
      "news.google.com",
      "flipboard.com",
      "smartnews.com",
      "apple.news",
      "ground.news",
      "techmeme.com",
      "newsnow.co.uk",
      "dailyhunt.in",
      "inshorts.com",
      "feedly.com",
    ],
    category: "unverified",
    flags: ["syndicated"],
    syndicatedFrom: "canonical",
    reason: "Aggregate, curate or summarise other publishers' stories and link to them",
    status: "V",
    evidence: [
      "https://support.google.com/googlenews/answer/9005601",
      "https://ground.news/about",
      "https://www.techmeme.com/about",
      "https://inshorts.com/tnc",
      "https://flipboard.com/",
      "https://about.smartnews.com/en/",
      "https://www.apple.com/apple-news/",
      "https://www.newsnow.co.uk/about/",
      "https://dailyhunt.in/",
      "https://docs.feedly.com/article/523-getting-started-with-feedly",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "blogs",
    hosts: ["substack.com", "wordpress.com", "blogspot.com", "tumblr.com", "medium.com"],
    category: "unverified",
    userContent: true,
    reason: "Platforms where anyone publishes",
    status: "V",
    evidence: [
      "https://substack.com/tos",
      "https://wordpress.com/tos/",
      "https://www.blogger.com/about/",
      "https://www.tumblr.com/policy/en/terms-of-service",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "social",
    hosts: [
      "facebook.com",
      "linkedin.com",
      "instagram.com",
      "youtube.com",
      "tiktok.com",
      "x.com",
      "twitter.com",
      "t.co",
    ],
    category: "unverified",
    userContent: true,
    reason: "Social networks where users post",
    status: "V",
    evidence: [
      "https://www.facebook.com/terms",
      "https://www.linkedin.com/legal/user-agreement",
      "https://www.youtube.com/t/terms",
      "https://www.tiktok.com/legal/page/row/terms-of-service/en",
      "https://about.instagram.com/about-us",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "forums",
    hosts: ["news.ycombinator.com", "reddit.com", "quora.com"],
    category: "unverified",
    userContent: true,
    reason: "Forums where users submit and discuss",
    status: "V",
    evidence: ["https://news.ycombinator.com/newsguidelines.html"],
    reviewed: REVIEWED,
  },
  {
    id: "wikis-archives",
    hosts: ["wikipedia.org", "wikimedia.org", "archive.org", "archive.ph"],
    category: "unverified",
    userContent: true,
    reason: "An encyclopedia anyone can edit; archives of copies of pages",
    status: "V",
    evidence: [
      "https://en.wikipedia.org/wiki/Wikipedia:About",
      "https://help.archive.org/help/wayback-machine-general-information/",
    ],
    reviewed: REVIEWED,
  },
  {
    id: "pastebin",
    hosts: ["pastebin.com"],
    category: "unverified",
    flags: ["blocked"],
    reason:
      "Anyone can store text there, guests included; a paste has no publisher to hold to account, and citing a dump of data can spread personal data",
    status: "V",
    evidence: ["https://pastebin.com/faq"],
    reviewed: REVIEWED,
  },
  {
    // Ruling 9(b) of the M0 plan.
    id: "bing",
    hosts: ["bing.com"],
    category: "unverified",
    reason: "Carried over from today's aggregator list; no page of Bing's was read",
    status: "U",
    evidence: [],
    reviewed: REVIEWED,
  },
];

export const REGISTRY: readonly RegistryEntry[] = [...OFFICIAL, ...TRUSTED_PRESS, ...UNVERIFIED];
