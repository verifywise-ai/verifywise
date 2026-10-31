/**
 * The research findings section in German, French and Spanish, through the real DOM
 * translator and dictionary, the way the vendor risk insights are checked. Each case ends with
 * the translator's gap audit: whatever English text it could not find in the dictionary, and
 * the test did not expect, fails the case. Vendor names, finding texts, quotes, hostnames and
 * the model's own notes are data and are never translated.
 */

import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  LANGS,
  expectNoUntranslatedText,
  plain,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../../test/i18nHelpers";
import { translations } from "../../../../../i18n/translations";
import type { ResearchAlert } from "../../../../../application/utils/vendorResearchAlerts";
import Alert from "../../../../components/Alert";
import type {
  CredibilityLabel,
  CredibilityRule,
  CredibilitySource,
  RecordSourceId,
} from "../../../../../domain/interfaces/i.vendorResearch";
import {
  acceptedRisk,
  ATTRIBUTIONS,
  coverage,
  finding,
  FOUR_OUTCOMES,
  listCopy,
  MODEL_NOTE,
  progress,
  refusal,
  run,
  secondFinding,
} from "./fixtures";

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchConfig: vi.fn(),
    getVendorResearchSettings: vi.fn(),
    saveVendorResearchSettings: vi.fn(),
    listVendorRiskFindings: vi.fn(),
    startVendorResearch: vi.fn(),
    getLatestVendorResearch: vi.fn(),
    acceptVendorRiskFinding: vi.fn(),
    dismissVendorRiskFinding: vi.fn(),
  }),
);

const role = vi.hoisted(() => ({ canEdit: true, isAdmin: true }));
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "risks.edit" && role.canEdit,
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => role.isAdmin,
}));
// The person who adds a risk is user 4; the users of the organization are 4 and 9.
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 4, userRoleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 4 }, { id: 9 }] }),
}));
// The keys of the organization, which the research settings window offers.
vi.mock("../../../../../application/hooks/useLLMKeys", () => ({
  useLLMKeys: () => ({
    keys: [
      { id: 30, name: "OpenAI", model: "gpt-newest" },
      { id: 20, name: "Anthropic", model: "claude-deep" },
    ],
    loading: false,
  }),
  invalidateLLMKeyQueries: vi.fn(),
}));
// The vendor risk form has its own tests, and is not part of this section: the stand-in shows the
// texts the section gives it and saves what it was opened with.
vi.mock("../../../../components/Modals/NewRisk", async () => ({
  default: (await import("./vendorRiskFormStub")).VendorRiskFormStub,
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import { joinAttributions } from "../../../../../application/utils/vendorResearchText";
import VendorResearchFindings from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  settings: vi.mocked(repository.getVendorResearchSettings),
  saveSettings: vi.mocked(repository.saveVendorResearchSettings),
  list: vi.mocked(repository.listVendorRiskFindings),
  start: vi.mocked(repository.startVendorResearch),
  latest: vi.mocked(repository.getLatestVendorResearch),
  accept: vi.mocked(repository.acceptVendorRiskFinding),
  dismiss: vi.mocked(repository.dismissVendorRiskFinding),
};

/** What the vendor filter lists: the user's own data, never translated. */
const FIXTURES = new Set(["Acme Cloud", "Zeta Labs"]);
/** The research settings window also lists the keys of the organization: provider and model are data. */
const KEY_FIXTURES = new Set([...FIXTURES, "OpenAI · gpt-newest", "Anthropic · claude-deep"]);

const VENDORS = [
  { id: 7, vendor_name: "Acme Cloud" },
  { id: 8, vendor_name: "Zeta Labs" },
];

const renderSection = (route = "/vendors/risks?findingsVendorId=7", vendors = VENDORS) => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  renderWithProviders(<VendorResearchFindings vendors={vendors} {...handlers} />, { route });
  return handlers;
};

/** The date as the screen writes it in a language: day, short month, year, in UTC. */
const dateIn = (lang: (typeof LANGS)[number], iso: string) =>
  new Date(iso).toLocaleDateString({ de: "de-DE", fr: "fr-FR", es: "es-ES" }[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Every word of the register's vocabulary the section can put on a row. */
const REGISTER_WORDS = {
  likelihood: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
  severity: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
  level: ["Very Low Risk", "Low Risk", "Medium Risk", "High Risk", "Very High Risk"],
  confidence: ["Low", "Medium", "High"],
};

/** A cited source as the credibility rule saw it: a page of a host nobody reviewed, by default. */
const citedSource = (overrides: Partial<CredibilitySource> = {}): CredibilitySource => ({
  url: "https://forum.example/thread/1",
  category: "unverified",
  publisher: "forum.example",
  entry: null,
  reviewed: false,
  reading: "read",
  ...overrides,
});
/** The record of a public database, matched strongly, from a copy of 7 Oct 2026. */
const recordSource = (
  source: RecordSourceId,
  record: Partial<NonNullable<CredibilitySource["record"]>> = {},
): CredibilitySource =>
  citedSource({
    url: `https://records.example/${source}`,
    category: "official",
    publisher: source,
    reviewed: true,
    record: {
      source,
      match: "strong",
      status: "active",
      source_record_id: "CVE-2026-28001",
      as_of: "2026-10-07",
      ...record,
    },
  });
const pressSource = (entry: string, name: string | undefined, url: string): CredibilitySource =>
  citedSource({
    url,
    category: "trusted_press",
    publisher: entry,
    entry,
    reviewed: true,
    ...(name === undefined ? {} : { publisher_name: name }),
  });

/**
 * A basis for every sentence the line of a credibility label can be, and the values the sentence
 * is filled with in a language: the names of the databases are translated, the hosts, publishers
 * and record ids are data.
 */
const RATIONALES: Array<{
  rule: CredibilityRule;
  sources: CredibilitySource[];
  key: string;
  values?: (lang: (typeof LANGS)[number]) => Record<string, string | number>;
}> = [
  {
    rule: "official_record",
    sources: [recordSource("kev")],
    key: "High: {operator} lists it ({record}), as of {date}.",
    values: (lang) => ({
      operator: tr(lang, "CISA Known Exploited Vulnerabilities"),
      record: "CVE-2026-28001",
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "official_record",
    sources: [recordSource("ofac", { as_of: undefined, source_record_id: "29001" })],
    key: "High: {operator} lists it ({record}).",
    values: (lang) => ({
      operator: tr(lang, "OFAC Specially Designated Nationals list"),
      record: "29001",
    }),
  },
  {
    rule: "official_record",
    sources: [recordSource("eu_fsf", { source_record_id: undefined })],
    key: "High: {operator} lists it, as of {date}.",
    values: (lang) => ({
      operator: tr(lang, "EU consolidated list of financial sanctions"),
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "official_record",
    sources: [recordSource("nvd", { source_record_id: undefined, as_of: undefined })],
    key: "High: {operator} lists it.",
    values: (lang) => ({ operator: tr(lang, "the National Vulnerability Database") }),
  },
  {
    rule: "official_record",
    sources: [recordSource("sec", { source_record_id: undefined, as_of: undefined })],
    key: "High: {operator} lists it.",
    values: (lang) => ({ operator: tr(lang, "SEC EDGAR") }),
  },
  {
    rule: "official_record",
    sources: [recordSource("cve", { source_record_id: undefined, as_of: undefined })],
    key: "High: {operator} lists it.",
    values: (lang) => ({ operator: tr(lang, "the CVE Program") }),
  },
  {
    rule: "official_record",
    sources: [recordSource("un_sanctions", { source_record_id: "EXe.012" })],
    key: "High: {operator} lists it ({record}), as of {date}.",
    values: (lang) => ({
      operator: tr(lang, "UN Security Council Consolidated List"),
      record: "EXe.012",
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "official_page",
    sources: [citedSource({ url: "https://www.sec.gov/a", category: "official" })],
    key: "High: an official source reports it ({host}).",
    values: () => ({ host: "sec.gov" }),
  },
  {
    rule: "official_page",
    sources: [citedSource({ url: "x", category: "official" })],
    key: "High: an official source reports it.",
  },
  {
    rule: "vendor_statement",
    sources: [
      citedSource({
        url: "https://status.acme.example/1",
        category: "vendor",
        publisher: "vendor",
        vendor_kind: "statement",
      }),
    ],
    key: "High: the vendor states it on its own pages ({host}).",
    values: () => ({ host: "status.acme.example" }),
  },
  {
    rule: "vendor_statement",
    sources: [
      citedSource({ url: "x", category: "vendor", publisher: "vendor", vendor_kind: "statement" }),
    ],
    key: "High: the vendor states it on its own pages.",
  },
  {
    rule: "trusted_press_two",
    sources: [
      pressSource("reuters", "Reuters", "https://www.reuters.com/a"),
      pressSource("bbc", "BBC", "https://www.bbc.co.uk/1"),
    ],
    key: "High: {count} independent trusted publishers report it ({publishers}).",
    values: () => ({ count: 2, publishers: "Reuters, BBC" }),
  },
  {
    rule: "trusted_press_two",
    sources: [pressSource("a", undefined, "x"), pressSource("b", undefined, "y")],
    key: "High: {count} independent trusted publishers report it.",
    values: () => ({ count: 2 }),
  },
  {
    rule: "trusted_press_one",
    sources: [pressSource("reuters", "Reuters", "https://www.reuters.com/a")],
    key: "Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher.",
    values: () => ({ publisher: "Reuters" }),
  },
  {
    rule: "trusted_press_one",
    sources: [pressSource("a", undefined, "x")],
    key: "Medium: one trusted publisher reports it; no official source and no second independent publisher.",
  },
  {
    rule: "capped_unconfirmed",
    sources: [citedSource({ reading: "unconfirmed" })],
    key: "Medium: only search results show it; the pages could not be read.",
  },
  {
    rule: "contradicted",
    sources: [citedSource({ reading: "contradicted" })],
    key: "Low: the pages do not hold what the search results quoted.",
  },
  {
    rule: "name_only",
    sources: [recordSource("ofac", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "OFAC SDN list") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("eu_fsf", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "EU financial sanctions list") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("uk_sanctions", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "UK Sanctions List") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("sec", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "SEC EDGAR filings") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("nvd", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "NVD") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("cve", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "CVE List") }),
  },
  {
    rule: "name_only",
    sources: [recordSource("un_sanctions", { match: "weak" })],
    key: "Low: the {list} entry matches the vendor by name only.",
    values: (lang) => ({ list: tr(lang, "UN Security Council Consolidated List") }),
  },
  {
    rule: "unverified",
    sources: [citedSource()],
    key: "Low: only unverified sources report it ({hosts}).",
    values: () => ({ hosts: "forum.example" }),
  },
  {
    rule: "unverified",
    sources: [citedSource({ url: "x" })],
    key: "Low: only unverified sources report it.",
  },
  {
    rule: "self_claim",
    sources: [citedSource({ category: "vendor", publisher: "vendor", vendor_kind: "self_claim" })],
    key: "Low: only the vendor's own claims support it.",
  },
  {
    rule: "inactive",
    sources: [recordSource("kev", { status: "withdrawn" })],
    key: "Low: {operator} withdrew the record on {date}.",
    values: (lang) => ({
      operator: tr(lang, "CISA Known Exploited Vulnerabilities"),
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "inactive",
    sources: [recordSource("kev", { status: "withdrawn", as_of: undefined })],
    key: "Low: {operator} withdrew the record.",
    values: (lang) => ({ operator: tr(lang, "CISA Known Exploited Vulnerabilities") }),
  },
  {
    rule: "inactive",
    sources: [recordSource("nvd", { status: "rejected" })],
    key: "Low: {operator} rejected the record on {date}.",
    values: (lang) => ({
      operator: tr(lang, "the National Vulnerability Database"),
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "inactive",
    sources: [recordSource("nvd", { status: "rejected", as_of: undefined })],
    key: "Low: {operator} rejected the record.",
    values: (lang) => ({ operator: tr(lang, "the National Vulnerability Database") }),
  },
  {
    rule: "inactive",
    sources: [recordSource("kev", { status: "rejected", rejected_by: "cve" })],
    key: "Low: {operator} rejected the record on {date}.",
    values: (lang) => ({
      operator: tr(lang, "the CVE Program"),
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "inactive",
    sources: [recordSource("un_sanctions", { status: "delisted", as_of: undefined })],
    key: "Low: {operator} removed the record.",
    values: (lang) => ({ operator: tr(lang, "UN Security Council Consolidated List") }),
  },
  {
    rule: "inactive",
    sources: [recordSource("uk_sanctions", { status: "delisted" })],
    key: "Low: {operator} removed the record on {date}.",
    values: (lang) => ({
      operator: tr(lang, "UK Sanctions List"),
      date: dateIn(lang, "2026-10-07"),
    }),
  },
  {
    rule: "inactive",
    sources: [recordSource("eu_fsf", { status: "delisted", as_of: undefined })],
    key: "Low: {operator} removed the record.",
    values: (lang) => ({ operator: tr(lang, "EU consolidated list of financial sanctions") }),
  },
];

/** The label a sentence goes with, from the word it starts with. */
const labelOfSentence = (key: string): CredibilityLabel =>
  key.startsWith("High:") ? "high" : key.startsWith("Medium:") ? "medium" : "low";

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  role.isAdmin = true;
  mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: true });
  mocks.settings.mockResolvedValue({
    researchKeyId: null,
    analysisKeyId: null,
    scanIntervalDays: null,
  });
  mocks.saveSettings.mockImplementation(async (settings) => settings);
  mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
  mocks.latest.mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
});

afterAll(() => setLanguage("en"));

describe("the register's words", () => {
  it.each(LANGS)("are in the %s dictionary, in the form the findings use", (lang) => {
    const missing = Object.values(REGISTER_WORDS)
      .flat()
      .filter((word) => translations[lang][word] === undefined);
    expect(missing).toEqual([]);
  });

  // Ruling R39, narrowed after the final review: the risk levels of the vendor register read noun
  // first in Spanish, whichever way their keys are written, so that the levels on one screen (the
  // findings, the risks table) are worded the same way.
  it.each([
    ["Very High Risk", "Riesgo muy alto"],
    ["High Risk", "Riesgo alto"],
    ["Medium Risk", "Riesgo medio"],
    ["Low Risk", "Riesgo bajo"],
    ["Very Low Risk", "Riesgo muy bajo"],
    ["Very high risk", "Riesgo muy alto"],
    ["Medium risk", "Riesgo medio"],
    ["Low risk", "Riesgo bajo"],
    ["Very low risk", "Riesgo muy bajo"],
    ["Very Low risk", "Riesgo muy bajo"],
  ])("reads the Spanish risk level %j noun first, as %j", (key, value) => {
    expect(translations.es[key]).toBe(value);
  });

  // The lowercase "High risk" is not only a level of the vendor register: it is the EU AI Act
  // classification and the project risk level on many screens, where "High-risk AI system" is
  // "Sistema de IA de alto riesgo". The research feature does not own it, so it keeps the wording
  // it always had.
  it('leaves the Spanish "High risk" as it was before the research agent', () => {
    expect(translations.es["High risk"]).toBe("Alto riesgo");
  });
});

/**
 * The section with the app's own Alert under it, which shows what the section hands to
 * `onNotify` the way the Vendors page does, so that the audit sees the text where it is rendered.
 */
function SectionWithAlert({ onNotify }: { onNotify: (alert: ResearchAlert) => void }) {
  const [alert, setAlert] = useState<ResearchAlert | null>(null);
  return (
    <>
      <VendorResearchFindings
        vendors={VENDORS}
        onOpenRisk={vi.fn()}
        onNotify={(next) => {
          onNotify(next);
          setAlert(next);
        }}
      />
      {alert && <Alert variant={alert.variant} title={alert.title} body={alert.body} isToast />}
    </>
  );
}

/** Every way a start of Research again can end, and the message that answers it. */
const START_OUTCOMES: Array<{
  name: string;
  arrange: () => void;
  variant: ResearchAlert["variant"];
  key: string;
  values?: Record<string, string | number>;
}> = [
  {
    name: "a new run",
    arrange: () =>
      mocks.start.mockResolvedValueOnce({ run: run({ status: "queued" }), alreadyRunning: false }),
    variant: "success",
    key: "Research started for {vendorName}. Findings appear on the Risks tab.",
    values: { vendorName: "Acme Cloud" },
  },
  {
    name: "a run the vendor already has",
    arrange: () =>
      mocks.start.mockResolvedValueOnce({ run: run({ status: "running" }), alreadyRunning: true }),
    variant: "info",
    key: "Research is already running for {vendorName}.",
    values: { vendorName: "Acme Cloud" },
  },
  {
    name: "a 409 for a missing LLM key",
    arrange: () => mocks.start.mockRejectedValueOnce(refusal(409, { code: "llm_key_missing" })),
    variant: "warning",
    key: "Vendor research is not set up.",
  },
  {
    name: "a 429 for the cooldown",
    arrange: () =>
      mocks.start.mockRejectedValueOnce(refusal(429, { code: "cooldown", retryAfterSeconds: 540 })),
    variant: "warning",
    key: "Research ran recently. Try again in {minutes} min.",
    values: { minutes: 9 },
  },
  {
    name: "a 429 for the daily limit",
    arrange: () => mocks.start.mockRejectedValueOnce(refusal(429, { code: "daily_cap" })),
    variant: "warning",
    key: "The daily research limit for your organization was reached. Try again tomorrow.",
  },
  {
    name: "a 503 from the job queue",
    arrange: () => mocks.start.mockRejectedValueOnce(refusal(503)),
    variant: "error",
    key: "The research could not be started because the job queue is unavailable. Try again later.",
  },
  {
    name: "any other failure",
    arrange: () => mocks.start.mockRejectedValueOnce(refusal(500)),
    variant: "error",
    key: "The research could not be started. Try again.",
  },
];

const CATEGORIES = [
  "Security incidents",
  "Certifications",
  "Legal and regulatory",
  "AI-specific risks",
  "Availability",
  "Financial health",
];
const OUTCOMES = ["risks found", "nothing found", "could not be researched", "skipped"];

/**
 * The text the section builds out of translated parts: the pending count, the line of every
 * category, and the date of the last run. A test that is about something else still has them
 * on screen, so they are expected in every test. Only their translated forms are: the same line
 * with one part left in English would not be in this list, and would fail the test.
 */
const registerComposedText = (lang: (typeof LANGS)[number]) => {
  for (const count of [0, 1, 2, 3, 250]) tr(lang, "Pending: {count}", { count });
  for (const category of CATEGORIES) {
    for (const outcome of OUTCOMES) {
      tr(lang, "{category}: {outcome}", {
        category: tr(lang, category),
        outcome: tr(lang, outcome),
      });
    }
  }
  tr(lang, "Last run: {date}", { date: plain(dateIn(lang, "2026-10-10T09:01:00.000Z")) });
};

describe.each(LANGS)("research findings in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
    registerComposedText(lang);
  });

  it("translates the header, the filter and a populated list", async () => {
    renderSection();

    expect(await screen.findByText(tr(lang, "Research findings"))).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "AI-suggested from web sources. Verify before accepting.")),
    ).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Pending: {count}", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "Vendor"))).toBeInTheDocument();
    expect(
      await screen.findByRole("list", { name: tr(lang, "Pending research findings") }),
    ).toBeInTheDocument();

    const first = within((await screen.findByText(finding().risk_description)).closest("li")!);
    for (const word of [
      "Security incidents",
      "Risk level",
      "Severity",
      "Likelihood",
      "Confidence",
      "Action plan",
      "Why this rating",
      "Sources",
      "High Risk",
      "Major",
      "Likely",
      "Medium",
      "Preview",
      "Dismiss",
    ]) {
      expect(first.getByText(tr(lang, word))).toBeInTheDocument();
    }
    const second = within(
      (await screen.findByText(secondFinding().risk_description)).closest("li")!,
    );
    for (const word of ["Certifications", "Medium Risk", "Moderate", "Possible", "High"]) {
      expect(second.getByText(tr(lang, word))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("leaves a vendor named like a translated word as it is, in the filter and in its menu", async () => {
    // "Other" and "High" are words of the dictionary; a vendor with that name is the user's data.
    const vendors = [
      { id: 7, vendor_name: "Other" },
      { id: 8, vendor_name: "High" },
    ];
    renderSection("/vendors/risks?findingsVendorId=7", vendors);

    const filter = await screen.findByRole("combobox");
    expect(filter).toHaveTextContent(/^Other$/);
    await userEvent.click(filter);
    const options = (await screen.findAllByRole("option")).map((option) =>
      option.textContent?.trim(),
    );
    expect(options).toEqual([tr(lang, "All vendors"), "High", "Other"]);

    expectNoUntranslatedText(lang, new Set([...FIXTURES, "Other", "High"]));
  });

  it("translates the caption of the action plan, and leaves the plan itself as it is", async () => {
    // "Other" is a word of the dictionary. The plan is the model's text, not ours: it is shown as
    // written, as the vendor named "Other" is.
    mocks.list.mockResolvedValue({ rows: [finding({ action_plan: "Other" })], total: 1 });
    renderSection();
    const row = within((await screen.findByText(finding().risk_description)).closest("li")!);

    expect(row.getByText(tr(lang, "Action plan"))).toBeInTheDocument();
    expect(row.getByText("Other")).toBeInTheDocument();
    expect(row.queryByText(tr(lang, "Other"))).not.toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the caption of the rationale, and leaves the rationale itself as it is", async () => {
    // "Other" is a word of the dictionary. The rationale is the model's text, not ours.
    mocks.list.mockResolvedValue({ rows: [finding({ rationale: "Other" })], total: 1 });
    renderSection();
    const row = within((await screen.findByText(finding().risk_description)).closest("li")!);

    expect(row.getByText(tr(lang, "Why this rating"))).toBeInTheDocument();
    expect(row.getByText("Other")).toBeInTheDocument();
    expect(row.queryByText(tr(lang, "Other"))).not.toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the notice of a finding whose quotes no page confirmed", async () => {
    mocks.list.mockResolvedValue({ rows: [finding({ snippet_only: true })], total: 1 });
    renderSection();
    const row = within((await screen.findByText(finding().risk_description)).closest("li")!);

    expect(
      row.getByText(tr(lang, "Not confirmed on the page. The quotes come from search results.")),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the sources that have no link", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          sources: [
            { url: "javascript:void(0)", title: "t", quote: "A quote", published_at: null },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();

    expect(await screen.findByText(tr(lang, "Unknown source"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates every word of the register's scales on a row", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          id: 1,
          likelihood: "Almost certain",
          risk_severity: "Catastrophic",
          risk_level: "Very High Risk",
          confidence: "high",
        }),
        finding({
          id: 2,
          risk_description: "Second",
          likelihood: "Rare",
          risk_severity: "Negligible",
          risk_level: "Very Low Risk",
          confidence: "low",
        }),
        finding({
          id: 3,
          risk_description: "Third",
          likelihood: "Unlikely",
          risk_severity: "Minor",
          risk_level: "Low Risk",
        }),
      ],
      total: 3,
    });
    renderSection();

    await screen.findByText("Second");
    for (const word of [
      "Almost certain",
      "Catastrophic",
      "Very High Risk",
      "Rare",
      "Negligible",
      "Very Low Risk",
      "Unlikely",
      "Minor",
      "Low Risk",
    ]) {
      expect(screen.getAllByText(tr(lang, word)).length).toBeGreaterThan(0);
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the credibility of a finding: its chip, its line, the note, the badges and the status of a record", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          credibility: "high",
          // Worked case 9b: a sanctions entry of the vendor's name, and two publishers.
          credibility_basis: {
            rule: "trusted_press_two",
            registry_version: "2026-10-29.1",
            name_only: true,
            sources: [
              recordSource("ofac", { match: "weak", stale: true }),
              pressSource("reuters", "Reuters", "https://www.reuters.com/a"),
              pressSource("bbc", "BBC", "https://www.bbc.co.uk/1"),
            ],
          },
          sources: [
            {
              url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=29001",
              title: "t",
              quote: "Organization Established Date 2014",
              published_at: null,
              category: "official",
              record: {
                source_id: "ofac",
                record_id: 3101,
                status: "delisted",
                match_strength: "weak",
              },
            },
            {
              url: "https://www.cisa.gov/kev",
              title: "t",
              quote: "A command injection vulnerability",
              published_at: null,
              category: "official",
              record: {
                source_id: "kev",
                record_id: 41,
                status: "withdrawn",
                match_strength: "strong",
              },
            },
            {
              url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1",
              title: "t",
              quote: "Rejected reason",
              published_at: null,
              category: "official",
              record: {
                source_id: "nvd",
                record_id: null,
                status: "rejected",
                match_strength: "strong",
              },
            },
            {
              url: "https://www.reuters.com/a",
              title: "t",
              quote: "q1",
              published_at: null,
              category: "trusted_press",
            },
            {
              url: "https://acme.example/news",
              title: "t",
              quote: "q2",
              published_at: null,
              category: "vendor",
            },
            {
              url: "https://forum.example/1",
              title: "t",
              quote: "q3",
              published_at: null,
              category: "unverified",
            },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    const row = within((await screen.findByText(finding().risk_description)).closest("li")!);

    expect(row.getByText(tr(lang, "Credibility"))).toBeInTheDocument();
    expect(row.getByText(tr(lang, "High"))).toBeInTheDocument();
    expect(row.queryByText(tr(lang, "Confidence"))).not.toBeInTheDocument();
    const sentence = tr(
      lang,
      "High: {count} independent trusted publishers report it ({publishers}).",
      {
        count: 2,
        publishers: "Reuters, BBC",
      },
    );
    const stale = tr(lang, "The source has not been updated since {date}.", {
      date: dateIn(lang, "2026-10-07"),
    });
    expect(row.getByText(plain(`${sentence} ${stale}`))).toBeInTheDocument();
    expect(
      row.getByText(tr(lang, "Matched by name only: this may be another company.")),
    ).toBeInTheDocument();
    expect(row.getAllByText(tr(lang, "Official"))).toHaveLength(3);
    for (const word of [
      "Trusted press",
      "Vendor",
      "Unverified",
      "Withdrawn",
      "Rejected",
      "Delisted",
    ]) {
      expect(row.getByText(tr(lang, word))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the line of every credibility rule", async () => {
    tr(lang, "Pending: {count}", { count: RATIONALES.length });
    mocks.list.mockResolvedValue({
      rows: RATIONALES.map((entry, index) =>
        finding({
          id: index + 1,
          risk_description: `Finding ${index + 1}`,
          credibility: labelOfSentence(entry.key),
          credibility_basis: {
            rule: entry.rule,
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: entry.sources,
          },
        }),
      ),
      total: RATIONALES.length,
    });
    renderSection();
    await screen.findByText(`Finding ${RATIONALES.length}`);

    for (const [index, entry] of RATIONALES.entries()) {
      const row = within(screen.getByText(`Finding ${index + 1}`).closest("li")!);
      expect(row.getByText(tr(lang, entry.key, entry.values?.(lang) ?? {}))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the notes of a label the backfill wrote", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({ credibility: "medium", credibility_basis: { rule: "legacy_confidence" } }),
        secondFinding({
          credibility: "low",
          credibility_basis: {
            rule: "backfill_self_claim",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [],
          },
        }),
      ],
      total: 2,
    });
    renderSection();

    const legacy = within((await screen.findByText(finding().risk_description)).closest("li")!);
    expect(
      legacy.getByText(tr(lang, "Rated with the earlier confidence rule.")),
    ).toBeInTheDocument();
    const backfilled = within(screen.getByText(secondFinding().risk_description).closest("li")!);
    const sentence = tr(lang, "Low: only the vendor's own claims support it.");
    const note = tr(lang, "Rated again with the current rule.");
    expect(backfilled.getByText(plain(`${sentence} ${note}`))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the coverage of a run, and leaves the attributions of the lists as they are", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: FOUR_OUTCOMES,
        coverage: coverage({
          sources: [
            listCopy("kev", {
              outcome: "found",
              strong: 1,
              stale: true,
              last_success_at: "2026-10-07T09:23:00.000Z",
            }),
            listCopy("ofac"),
            listCopy("uk_sanctions"),
            listCopy("eu_fsf"),
          ],
          lookups: [
            { id: "nvd", outcome: "found" },
            { id: "sec", outcome: "none" },
            { id: "hibp", outcome: "found" },
            { id: "statuspage", outcome: "none" },
          ],
          cited: { official: 1, trusted_press: 2, vendor: 3, unverified: 4 },
        }),
      }),
    );
    renderSection();
    const name = (key: string) => tr(lang, key);

    expect(
      await screen.findByText(
        tr(lang, "Checked: {sources}", {
          sources: [
            `${name("CISA Known Exploited Vulnerabilities")} (1)`,
            `${name("OFAC Specially Designated Nationals list")} (0)`,
            `${name("UK Sanctions List")} (0)`,
            `${name("EU consolidated list of financial sanctions")} (0)`,
            name("the National Vulnerability Database"),
            name("SEC EDGAR"),
            name("Have I Been Pwned"),
            name("the vendor's status page"),
          ].join(", "),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "No records in {sources} as of {dates}", {
          sources: [
            name("OFAC Specially Designated Nationals list"),
            name("UK Sanctions List"),
            name("EU consolidated list of financial sanctions"),
          ].join(", "),
          dates: dateIn(lang, "2026-10-10T08:00:00.000Z"),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "{source}: last updated {date}, not up to date", {
          source: name("CISA Known Exploited Vulnerabilities"),
          date: dateIn(lang, "2026-10-07T09:23:00.000Z"),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(
          lang,
          "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified",
          { official: 1, press: 2, vendor: 3, unverified: 4 },
        ),
      ),
    ).toBeInTheDocument();
    // The words of the licences stay as their owners wrote them; the label before them does not.
    expect(
      screen.getByText(
        tr(lang, "Data sources: {attributions}", { attributions: joinAttributions(ATTRIBUTIONS) }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the coverage of a run that read the NVD through, and checked the CVE and UN lists", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: FOUR_OUTCOMES,
        coverage: coverage({
          sources: [
            listCopy("nvd", { mode: "read_through", outcome: "found", strong: 2 }),
            listCopy("sec", { mode: "read_through", checked: false, outcome: "failed" }),
            listCopy("cve"),
            listCopy("un_sanctions", { outcome: "found", strong: 1 }),
          ],
          lookups: [
            { id: "hibp", outcome: "none" },
            { id: "statuspage", outcome: "not_researched" },
          ],
        }),
      }),
    );
    renderSection();
    const name = (key: string) => tr(lang, key);

    expect(
      await screen.findByText(
        tr(lang, "Checked: {sources}", {
          sources: [
            `${name("the National Vulnerability Database")} (2)`,
            `${name("the CVE Program")} (0)`,
            `${name("UN Security Council Consolidated List")} (1)`,
            name("Have I Been Pwned"),
          ].join(", "),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "Not checked: {sources}", { sources: name("SEC EDGAR") })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "No records in {sources} as of {dates}", {
          sources: name("the CVE Program"),
          dates: dateIn(lang, "2026-10-10T08:00:00.000Z"),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(
          lang,
          "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified",
          { official: 1, press: 0, vendor: 0, unverified: 0 },
        ),
      ),
    ).toBeInTheDocument();
    // The notices stay as their owners wrote them, the NVD's among them.
    expect(
      screen.getByText(
        tr(lang, "Data sources: {attributions}", {
          attributions: joinAttributions([
            "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
            "CVE® records © The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)",
            "United Nations Security Council Consolidated List",
          ]),
        }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the sources a run could not check", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("kev", { outcome: "found", strong: 1 }),
            listCopy("ofac", { checked: false, outcome: "failed", last_success_at: null }),
          ],
          lookups: [{ id: "statuspage", outcome: "failed" }],
        }),
      }),
    );
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "Not checked: {sources}", {
          sources: [
            tr(lang, "OFAC Specially Designated Nationals list"),
            tr(lang, "the vendor's status page"),
          ].join(", "),
        }),
      ),
    ).toBeInTheDocument();
    // The other lines of the block, which the screen shows beside it.
    expect(
      screen.getByText(
        tr(lang, "Checked: {sources}", {
          sources: `${tr(lang, "CISA Known Exploited Vulnerabilities")} (1)`,
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(
          lang,
          "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified",
          { official: 1, press: 0, vendor: 0, unverified: 0 },
        ),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a run whose public databases were turned off", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: (["kev", "ofac", "uk_sanctions", "eu_fsf"] as const).map((id) =>
            listCopy(id, { checked: false, outcome: "off" }),
          ),
          lookups: [],
          cited: { official: 0, trusted_press: 0, vendor: 0, unverified: 0 },
        }),
      }),
    );
    renderSection();

    expect(await screen.findByText(tr(lang, "Public databases turned off"))).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(
          lang,
          "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified",
          { official: 0, press: 0, vendor: 0, unverified: 0 },
        ),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a run summary with all four outcomes, a model-written note and the notes of the others", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          { category: "security_incidents", outcome: "nothing_found", note: MODEL_NOTE },
          { category: "certifications", outcome: "findings", note: "1 potential risk found" },
          {
            category: "legal_regulatory",
            outcome: "search_failed",
            note: "The search was not available",
          },
          {
            category: "ai_specific",
            outcome: "skipped",
            note: "Vendor website is missing or not a valid domain",
          },
        ],
      }),
    );
    renderSection();

    expect(await screen.findByText(tr(lang, "Latest research"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Research again") })).toBeInTheDocument();
    const line = (category: string, outcome: string) =>
      tr(lang, "{category}: {outcome}", {
        category: tr(lang, category),
        outcome: tr(lang, outcome),
      });
    expect(
      await screen.findByText(line("Security incidents", "nothing found")),
    ).toBeInTheDocument();
    expect(screen.getByText(line("Certifications", "risks found"))).toBeInTheDocument();
    expect(
      screen.getByText(line("Legal and regulatory", "could not be researched")),
    ).toBeInTheDocument();
    expect(screen.getByText(line("AI-specific risks", "skipped"))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "AI note (unverified)"))).toBeInTheDocument();
    expect(screen.getByText(MODEL_NOTE)).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "1 potential risk found"))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "The search was not available."))).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "The vendor website is missing or is not a valid domain.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Last run: {date}", { date: plain(dateIn(lang, "2026-10-10T09:01:00.000Z")) }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the fixed notes of a run summary", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          {
            category: "security_incidents",
            outcome: "nothing_found",
            note: "No risks found in the sources reviewed",
          },
          {
            category: "certifications",
            outcome: "nothing_found",
            note: "No risks found; 2 of 5 pages could not be read",
          },
          {
            category: "legal_regulatory",
            outcome: "nothing_found",
            note: "Possible risks were found but could not be verified or are already recorded",
          },
          { category: "ai_specific", outcome: "findings", note: "12 potential risks found" },
          {
            category: "availability",
            outcome: "nothing_found",
            note: "No new sources since the last run",
          },
          { category: "financial_health", outcome: "findings", note: "3 potential risks found" },
        ],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(tr(lang, "No risks were found in the sources reviewed.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "No new sources were found since the last run.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "No risks were found. {failed} of {total} pages could not be read.", {
          failed: 2,
          total: 5,
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Possible risks were found but could not be verified, or are already recorded."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "{count} potential risks found", { count: 12 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "{count} potential risks found", { count: 3 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "{category}: {outcome}", {
          category: tr(lang, "Financial health"),
          outcome: tr(lang, "risks found"),
        }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the notes of a run summary whose categories were not researched", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          {
            category: "security_incidents",
            outcome: "skipped",
            note: "Not researched: the time limit was reached",
          },
          {
            category: "certifications",
            outcome: "skipped",
            note: "Not researched: the research ended before this category was covered",
          },
          {
            category: "legal_regulatory",
            outcome: "search_failed",
            note: "The pages could not be read",
          },
          {
            category: "ai_specific",
            outcome: "search_failed",
            note: "The search was not available",
          },
        ],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(tr(lang, "Not researched: the time limit was reached.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Not researched: the research ended before this category was covered."),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "The pages could not be read."))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "The search was not available."))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates what a run did", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, searches_used: 6, pages_read: 4 }),
    );
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "Searches: {searches}, pages read: {pages}", { searches: 6, pages: 4 }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a failed run", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The run stopped because the web could not be reached",
        category_summary: [
          {
            category: "security_incidents",
            outcome: "search_failed",
            note: "The search was not available",
          },
        ],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(tr(lang, "The web could not be reached from the server.")),
    ).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "The search was not available."))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the run in which the model did not use the research actions", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The model did not use the research actions",
        category_summary: [],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(tr(lang, "The model did not carry out the research steps.")),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a failed run that has no categories, and its other errors", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "failed", error: "Model call failed: HTTP 502", category_summary: [] }),
    );
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "The model call failed with HTTP status {status}.", { status: 502 }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the running state", async () => {
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection();

    expect(await screen.findByText(tr(lang, "Researching…"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates what a running run is doing, the categories so far and the counts", async () => {
    mocks.latest.mockResolvedValue(run({ status: "running", progress: progress() }));
    renderSection();

    expect(await screen.findByText(tr(lang, "Researching…"))).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Reading a page: {category}", { category: tr(lang, "Certifications") }),
      ),
    ).toBeInTheDocument();
    const covered = [tr(lang, "Security incidents"), tr(lang, "Certifications")].join(", ");
    expect(
      screen.getByText(tr(lang, "Researched so far: {categories}", { categories: covered })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Searches: {searches}, pages read: {pages}", { searches: 2, pages: 1 }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it.each([
    [
      "the start",
      { steps: 0, action: null, category: null, categories: [] },
      "Starting the research",
    ],
    ["a search", { action: "search" as const, category: null }, "Searching the web"],
    ["a read", { action: "read" as const, category: null }, "Reading a page"],
    ["the analysis", { phase: "analysing" as const, action: null }, "Analysing what was found"],
  ])("translates what a run is doing at %s", async (_when, overrides, key) => {
    // Without counts and categories, so that the line of the step is the only one on screen.
    mocks.latest.mockResolvedValue(
      run({
        status: "running",
        progress: progress({ searchesUsed: 0, pagesRead: 0, categories: [], ...overrides }),
      }),
    );
    renderSection();

    expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the run that is still going after polling stopped", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(screen.getByText(tr(lang, "Still running. Check back later."))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Check again") })).toBeInTheDocument();
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the message for a vendor that was never researched", async () => {
    mocks.latest.mockResolvedValue(null);
    renderSection();

    expect(
      await screen.findByText(tr(lang, "No research has run for this vendor yet.")),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the error of a latest run that could not be loaded", async () => {
    mocks.latest.mockRejectedValue(new Error("boom"));
    renderSection();

    expect(
      await screen.findByText(tr(lang, "Could not load the latest research run.")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Retry") })).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the loading state", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    renderSection();
    expect(
      await screen.findByRole("status", { name: tr(lang, "Loading research findings") }),
    ).toBeInTheDocument();
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the error state of the list", async () => {
    mocks.list.mockRejectedValue(new Error("boom"));
    renderSection();

    expect(
      await screen.findByText(tr(lang, "Could not load research findings.")),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: tr(lang, "Retry") }).length).toBeGreaterThan(0);

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the empty state", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    expect(await screen.findByText(tr(lang, "No pending research findings."))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the not-set-up state, with the hint for an Admin", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection();

    expect(await screen.findByText(tr(lang, "Vendor research is not set up."))).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Add an LLM key under Settings → API Keys, in the LLM Keys section."),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the notice that more findings are pending than shown", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 250 });
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.", {
          shown: 2,
          total: 250,
        }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the tooltip of Research again when research is not set up", async () => {
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection();

    // The button is rebuilt inside its tooltip once the settings say research is not set up.
    const againButton = () => screen.getByRole("button", { name: tr(lang, "Research again") });
    await waitFor(() => expect(againButton()).toBeDisabled());
    await userEvent.hover(againButton().parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      tr(lang, "Vendor research is not set up."),
    );

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the form a finding is previewed in", async () => {
    renderSection();
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;

    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Preview") }));

    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Review suggested risk") });
    expect(
      within(dialog).getByText(
        tr(
          lang,
          "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.",
        ),
      ),
    ).toBeInTheDocument();
    // Opening the form decides nothing: the finding is still pending.
    expect(mocks.accept).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Cancel") }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.accept).not.toHaveBeenCalled();
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the toast and the notice after a finding is added through the form", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    const { onNotify } = renderSection();
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Preview") }));
    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Review suggested risk") });

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Save") }));

    expect(await screen.findByText(tr(lang, "Risk added to the register."))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Open risk") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Close") })).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: tr(lang, "Risk added to the register"),
    });

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the message after a dismissal", async () => {
    mocks.dismiss.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return finding({ status: "dismissed" });
    });
    const onNotify = vi.fn();
    renderWithProviders(<SectionWithAlert onNotify={onNotify} />, {
      route: "/vendors/risks?findingsVendorId=7",
    });
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Dismiss") }));
    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Dismiss finding") });
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: tr(lang, "Other") }));

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Dismiss") }));

    expect(await screen.findByText(tr(lang, "Finding dismissed."))).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: tr(lang, "Finding dismissed."),
    });
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the message for a finding that no longer exists", async () => {
    mocks.accept.mockRejectedValueOnce(refusal(404, "Finding not found"));
    const onNotify = vi.fn();
    renderWithProviders(<SectionWithAlert onNotify={onNotify} />, {
      route: "/vendors/risks?findingsVendorId=7",
    });
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Preview") }));
    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Review suggested risk") });

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Save") }));

    expect(await screen.findByText(tr(lang, "This finding no longer exists."))).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({
      variant: "warning",
      body: tr(lang, "This finding no longer exists."),
    });
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the dismiss modal and its seven reasons", async () => {
    renderSection();
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;

    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Dismiss") }));

    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Dismiss finding") });
    expect(
      within(dialog).getByText(
        tr(
          lang,
          "Choose why this finding does not belong in the register. Similar findings are not suggested again.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Reason"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Select a reason"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Note"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "(optional)"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Up to 500 characters."))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Cancel") })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Dismiss") })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("combobox"));
    for (const reason of [
      "Not applicable to this vendor",
      "Already covered by an existing risk",
      "Inaccurate or not supported by the sources",
      "Accepted risk",
      "The sources are about another company",
      "The sources are out of date",
      "Other",
    ]) {
      expect(await screen.findByRole("option", { name: tr(lang, reason) })).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  /** Opens the research settings window and gives it, once the two selects are in it. */
  const openSettings = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Research settings") }),
    );
    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Research settings") });
    return dialog;
  };

  it("translates the research settings window, its three selects and their options", async () => {
    renderSection();

    const dialog = await openSettings();
    await within(dialog).findAllByRole("combobox");

    expect(
      within(dialog).getByText(
        tr(
          lang,
          "Choose which LLM key runs the vendor research. The research key makes many small calls, so a fast, inexpensive model is enough. The analysis key writes the risks from what the research found, once per run, so a stronger model can help.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Research key"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Analysis key"))).toBeInTheDocument();
    const [research, analysis, scan] = within(dialog).getAllByRole("combobox");
    expect(research).toHaveTextContent(tr(lang, "Newest key (default)"));
    expect(analysis).toHaveTextContent(tr(lang, "Same as the research key (default)"));
    expect(within(dialog).getByText(tr(lang, "Scheduled scan"))).toBeInTheDocument();
    expect(scan).toHaveTextContent(tr(lang, "Off"));
    expect(
      within(dialog).getByText(
        tr(
          lang,
          "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something. It analyses only sources it has not seen before, and it uses the keys above.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Cancel") })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Save") })).toBeInTheDocument();

    // The keys are listed by provider and model, which are data and stay as they are.
    await userEvent.click(research);
    const options = (await screen.findAllByRole("option")).map((option) =>
      option.textContent?.trim(),
    );
    expect(options).toEqual([
      tr(lang, "Newest key (default)"),
      "OpenAI · gpt-newest",
      "Anthropic · claude-deep",
    ]);
    await userEvent.keyboard("{Escape}");

    // The scan lists off and the three intervals, all in words.
    await userEvent.click(scan);
    const intervals = (await screen.findAllByRole("option")).map((option) =>
      option.textContent?.trim(),
    );
    expect(intervals).toEqual([
      tr(lang, "Off"),
      tr(lang, "Every week"),
      tr(lang, "Every 2 weeks"),
      tr(lang, "Every month"),
    ]);

    expectNoUntranslatedText(lang, KEY_FIXTURES);
  });

  it("translates the loading state of the research settings window", async () => {
    mocks.settings.mockReturnValue(new Promise(() => {}));
    renderSection();

    const dialog = await openSettings();

    expect(
      await within(dialog).findByRole("status", { name: tr(lang, "Loading research settings") }),
    ).toBeInTheDocument();
    expectNoUntranslatedText(lang, KEY_FIXTURES);
  });

  it("translates the error state of the research settings window", async () => {
    mocks.settings.mockRejectedValue(refusal(500));
    renderSection();

    const dialog = await openSettings();

    expect(
      await within(dialog).findByText(tr(lang, "Could not load the research settings.")),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Retry") })).toBeInTheDocument();
    expectNoUntranslatedText(lang, KEY_FIXTURES);
  });

  it("translates the message after the research settings were saved", async () => {
    const onNotify = vi.fn();
    renderWithProviders(<SectionWithAlert onNotify={onNotify} />, {
      route: "/vendors/risks?findingsVendorId=7",
    });
    const dialog = await openSettings();
    await within(dialog).findAllByRole("combobox");

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Save") }));

    expect(await screen.findByText(tr(lang, "Research settings saved."))).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: tr(lang, "Research settings saved."),
    });
    expectNoUntranslatedText(lang, KEY_FIXTURES);
  });

  it("translates the message for a key that no longer exists", async () => {
    mocks.saveSettings.mockRejectedValueOnce(refusal(404));
    const onNotify = vi.fn();
    renderWithProviders(<SectionWithAlert onNotify={onNotify} />, {
      route: "/vendors/risks?findingsVendorId=7",
    });
    const dialog = await openSettings();
    await within(dialog).findAllByRole("combobox");

    await userEvent.click(within(dialog).getByRole("button", { name: tr(lang, "Save") }));

    const body = tr(lang, "One of the chosen LLM keys no longer exists. Choose the keys again.");
    expect(await screen.findByText(body)).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({ variant: "warning", body });
    expectNoUntranslatedText(lang, KEY_FIXTURES);
  });

  it.each(START_OUTCOMES)(
    "answers $name in the language of the screen",
    async ({ arrange, variant, key, values }) => {
      arrange();
      const onNotify = vi.fn();
      renderWithProviders(<SectionWithAlert onNotify={onNotify} />, {
        route: "/vendors/risks?findingsVendorId=7",
      });

      await userEvent.click(
        await screen.findByRole("button", { name: tr(lang, "Research again") }),
      );

      const body = tr(lang, key, values);
      expect(await screen.findByText(body)).toBeInTheDocument();
      expect(onNotify).toHaveBeenCalledTimes(1);
      expect(onNotify).toHaveBeenCalledWith({ variant, body });
      expectNoUntranslatedText(lang, FIXTURES);
    },
  );
});
