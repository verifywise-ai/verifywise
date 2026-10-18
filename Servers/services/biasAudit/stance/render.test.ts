const utils = {
  getRunProjectIdQuery: jest.fn(),
  createStanceQuery: jest.fn(),
  getNextStanceVersionQuery: jest.fn(),
  getProfileByIdQuery: jest.fn(),
  createProfileStanceQuery: jest.fn(),
  getNextProfileStanceVersionQuery: jest.fn(),
  assertProfileAttestedQuery: jest.fn(),
  checkProfileAttestedQuery: jest.fn(),
};
jest.mock("../../../utils/biasAudit.utils", () => utils);

const uploadFile = jest.fn();
jest.mock("../../../utils/fileUpload.utils", () => ({
  uploadFile,
  BIAS_AUDIT_STANCE_SOURCE: "Bias audit stance report",
}));

const tx = { id: "tx" };
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}));

const pdfMock = jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
// The stance renders on the server's shared browser; it never launches its own.
const getSharedBrowser = jest.fn();
jest.mock("../../../utils/pdfBrowser.utils", () => ({ getSharedBrowser }));
const launch = jest.fn(() => {
  throw new Error("the stance render must not launch a browser of its own");
});
jest.mock("playwright", () => ({ chromium: { launch } }));

import { checkSections } from "./sectionChecker";
import { renderStanceHtml, persistStance, findForbiddenWords } from "./render";
import type { StanceEvidence } from "./render";
import { REQUIRED_SECTIONS } from "./compose";
import * as renderModule from "./render";
import { composeStance } from "./compose";
import { runAnswerGates } from "../answerGates";
import { computeReadiness } from "../readinessScore";

const model: any = {
  heading: "Bias testing result",
  scope: "in_scope",
  sections: [...REQUIRED_SECTIONS, "readiness"].map((k) => ({
    key: k,
    title: k,
    body: `body of ${k}`,
  })),
  blankFields: [
    { field: "distribution_date", instruction: "To be completed by the deploying employer." },
  ],
  openItems: ["Whether the input is transformed before scoring"],
  expiry: { date: "2027-10-14", trigger: "Ends when characteristics are captured." },
  derivedBasis: null,
  attestation: { user: "A. Admin", date: "2026-10-14" },
};

const evidence: StanceEvidence = {
  datasetSha256: "a".repeat(64),
  datasetRetained: false,
  rowCount: 1234,
  presetId: "nyc_ll144",
  metric: "selection_rate",
  threshold: 0.8,
  thresholdSource: "convention",
  smallSampleExclusion: 0.02,
  categories: ["Sex", "Race and ethnicity", "Intersectional categories"],
  mayExportPdf: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  pdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  getSharedBrowser.mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: pdfMock,
      close: jest.fn(),
    }),
    close: jest.fn(),
  });
  utils.getRunProjectIdQuery.mockResolvedValue(7);
});

/**
 * Renders through persistStance, the one gated path to a stance PDF, and
 * returns the PDF it filed with its hash. Removing the export gate from that
 * path fails the evidence-rule tests that use this.
 */
async function renderThroughPersist(
  m: any,
  ev: StanceEvidence | null | undefined,
  parent: "run" | "profile",
): Promise<{ pdf: Buffer; sha256: string }> {
  uploadFile.mockResolvedValue({ id: 501 });
  utils.getNextStanceVersionQuery.mockResolvedValue(1);
  utils.createStanceQuery.mockResolvedValue({ id: 9, version: 1 });
  utils.getNextProfileStanceVersionQuery.mockResolvedValue(1);
  utils.createProfileStanceQuery.mockResolvedValue({ id: 30, version: 1 });
  const common = {
    projectId: 7,
    organizationId: 42,
    userId: 9,
    model: m,
    evidence: ev,
    scoreAtGeneration: null,
  };
  const out = await persistStance(
    (parent === "run" ? { ...common, runId: 11 } : { ...common, profileId: 5 }) as any,
  );
  const filed = uploadFile.mock.calls[uploadFile.mock.calls.length - 1][0];
  return { pdf: filed.buffer, sha256: out.sha256 };
}

describe("checkSections", () => {
  it("passes when every required section is present", () => {
    const html = REQUIRED_SECTIONS.map((k) => `<section data-key="${k}"></section>`).join("");
    expect(checkSections(html)).toEqual({ missing: [], ok: true });
  });

  it("names the missing sections", () => {
    const out = checkSections('<section data-key="scope"></section>');
    expect(out.ok).toBe(false);
    expect(out.missing).toContain("independence");
  });

  it("checks against a narrower list when one is given", () => {
    const out = checkSections('<section data-key="scope"></section>', ["scope"]);
    expect(out).toEqual({ missing: [], ok: true });
  });
});

describe("renderStanceHtml", () => {
  it("renders the same HTML for the same model", () => {
    expect(renderStanceHtml(model, evidence)).toBe(renderStanceHtml(model, evidence));
  });

  it("emits a section per key, the blank fields and the not-an-audit footer", () => {
    const html = renderStanceHtml(model, evidence);
    expect(checkSections(html).ok).toBe(true);
    expect(html).toContain("Distribution date");
    expect(html).not.toContain("distribution_date");
    expect(html).toContain("To be completed by the deploying employer.");
    // The label is printed once, above its instruction.
    expect(html.match(/Distribution date/g)).toHaveLength(1);
    expect(html).toContain(
      "This document is not a Local Law 144 bias audit. It records the answers given and the figures computed from the file supplied, as given.",
    );
    // A result from a file is not a scope determination.
    expect(html).not.toContain("The scope determination belongs to the party that answered.");
  });

  it("shows the dataset hash and what was tested", () => {
    const html = renderStanceHtml(model, evidence);
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("1234");
    expect(html).toContain("Selection rate");
    expect(html).not.toContain("selection_rate");
    expect(html).not.toContain("nyc_ll144");
    expect(html).toContain("New York City Local Law 144");
    expect(html).toContain("0.80 (EEOC four-fifths convention; the statute does not adopt it)");
    expect(html).toContain("2% (§ 5-301(d))");
    expect(html).toContain("Race and ethnicity");
    expect(html).toMatch(/not retained/i);
  });

  it("says so when no evidence was supplied", () => {
    expect(renderStanceHtml(model)).toMatch(/Dataset SHA-256<\/dt><dd>not recorded/);
  });

  it("escapes model text", () => {
    const m = {
      ...model,
      sections: model.sections.map((s: any) =>
        s.key === "scope" ? { ...s, body: "<script>alert(1)</script>" } : s,
      ),
    };
    expect(renderStanceHtml(m, evidence)).not.toContain("<script>alert(1)</script>");
  });
});

describe("customer quotes and the vocabulary lint", () => {
  const quoted = {
    ...model,
    sections: model.sections.map((s: any) =>
      s.key === "scope"
        ? {
            ...s,
            body: `Question: Q\nAnswer: A.\nIn your words: "We were audited last year"\nAnswered by U on 2026-10-01.`,
            customerText: [
              { lead: `In your words: "`, text: "We were audited last year", tail: `"` },
            ],
          }
        : s,
    ),
  };

  it("renders a customer note verbatim in a marked element, and the lint skips it", () => {
    const html = renderStanceHtml(quoted, evidence);
    expect(html).toMatch(/<span data-customer-text>We were audited last year/);
    expect(findForbiddenWords(html)).toEqual([]);
  });

  it("quotes a job title with a forbidden word rather than refusing the document", () => {
    const tested = {
      ...model,
      sections: model.sections.map((s: any) =>
        s.key === "what_was_tested"
          ? {
              ...s,
              body: "Job description tested: certified nurse.",
              customerText: [
                { lead: "Job description tested: ", text: "certified nurse", tail: "." },
              ],
            }
          : s,
      ),
    };
    const html = renderStanceHtml(tested, evidence);
    expect(html).toMatch(/<span data-customer-text>certified nurse<\/span>/);
    expect(findForbiddenWords(html)).toEqual([]);
  });

  it("still catches a forbidden word in our own text", () => {
    const own = {
      ...quoted,
      sections: quoted.sections.map((s: any) =>
        s.key === "results" ? { ...s, body: "The tool is compliant." } : s,
      ),
    };
    expect(findForbiddenWords(renderStanceHtml(own, evidence))).toEqual(["compliant"]);
  });

  it("does not let a quote element hide a forbidden word outside it", () => {
    const html = renderStanceHtml(quoted, evidence) + "<p>certified</p>";
    expect(findForbiddenWords(html)).toEqual(["certified"]);
  });

  it("refuses to render a PDF whose own text carries a forbidden word", async () => {
    const own = {
      ...model,
      sections: model.sections.map((s: any) =>
        s.key === "results" ? { ...s, body: "bias-free" } : s,
      ),
    };
    await expect(renderThroughPersist(own, evidence, "run")).rejects.toThrow(/forbidden/i);
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("renders a PDF for a stance that quotes the word", async () => {
    await expect(renderThroughPersist(quoted, evidence, "run")).resolves.toBeDefined();
  });
});

describe("rendering the stance PDF, through persistStance", () => {
  it("returns a buffer and its sha256", async () => {
    const out = await renderThroughPersist(model, evidence, "run");
    expect(out.pdf).toBeInstanceOf(Buffer);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to render when a required section is absent, before launching a browser", async () => {
    const broken = { ...model, sections: model.sections.slice(0, 2) };
    await expect(renderThroughPersist(broken, evidence, "run")).rejects.toThrow(
      /missing required section/i,
    );
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("refuses to render when the gates do not allow export", async () => {
    await expect(
      renderThroughPersist(model, { ...evidence, mayExportPdf: false }, "run"),
    ).rejects.toThrow(/export/i);
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("refuses with a 422 business-rule error, never a bare Error, so no refusal reaches a client as a 500", async () => {
    const forbidden = {
      ...model,
      sections: model.sections.map((s: any) =>
        s.key === "results" ? { ...s, body: "passed" } : s,
      ),
    };
    const refusals = [
      () => renderThroughPersist(model, { ...evidence, mayExportPdf: false }, "run"),
      () => renderThroughPersist(model, null as any, "run"),
      () =>
        renderThroughPersist({ ...model, sections: model.sections.slice(0, 2) }, evidence, "run"),
      () => renderThroughPersist(forbidden, evidence, "run"),
    ];
    for (const r of refusals) {
      await expect(r()).rejects.toMatchObject({ name: "BusinessLogicException", statusCode: 422 });
    }
  });

  it("refuses to render a PDF without evidence, before launching a browser", async () => {
    await expect(renderThroughPersist(model, undefined as any, "run")).rejects.toThrow(/evidence/i);
    await expect(renderThroughPersist(model, null as any, "run")).rejects.toThrow(/evidence/i);
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("accepts the narrower section list of an out-of-scope determination", async () => {
    const out = {
      ...model,
      scope: "out_of_scope",
      sections: model.sections.filter((s: any) =>
        ["scope", "party", "open_items", "expiry"].includes(s.key),
      ),
    };
    await expect(renderThroughPersist(out, evidence, "run")).resolves.toBeDefined();
  });

  it("renders on the shared browser, opening and closing only its own page", async () => {
    const page = { setContent: jest.fn(), pdf: pdfMock, close: jest.fn() };
    const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    getSharedBrowser.mockResolvedValue(browser);
    await renderThroughPersist(model, evidence, "run");
    await renderThroughPersist(model, evidence, "run");
    expect(getSharedBrowser).toHaveBeenCalledTimes(2);
    expect(launch).not.toHaveBeenCalled();
    expect(browser.newPage).toHaveBeenCalledTimes(2);
    expect(page.close).toHaveBeenCalledTimes(2);
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("closes its page, and leaves the shared browser open, when the PDF step fails", async () => {
    const page = {
      setContent: jest.fn(),
      pdf: jest.fn().mockRejectedValue(new Error("boom")),
      close: jest.fn(),
    };
    const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    getSharedBrowser.mockResolvedValue(browser);
    await expect(renderThroughPersist(model, evidence, "run")).rejects.toThrow("boom");
    expect(page.close).toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });
});

describe("persistStance immutability", () => {
  const base = {
    runId: 11,
    projectId: 7,
    organizationId: 42,
    userId: 9,
    model,
    evidence,
    scoreAtGeneration: 72,
  };

  beforeEach(() => {
    uploadFile.mockResolvedValue({ id: 501 });
  });

  it("takes the versions from the run, not from the caller", async () => {
    utils.getNextStanceVersionQuery.mockResolvedValue(2);
    utils.createStanceQuery.mockResolvedValue({ id: 9, version: 2 });
    await persistStance({ ...base, profileVersion: 2, questionSetVersion: 1 } as any);
    const row = utils.createStanceQuery.mock.calls[0][0];
    expect(row).not.toHaveProperty("profileVersion");
    expect(row).not.toHaveProperty("questionSetVersion");
    expect(row.version).toBe(2);
    expect(row.runId).toBe(11);
    expect(row.scopeAtGeneration).toBe("in_scope");
    expect(row.scoreAtGeneration).toBe(72);
    expect(row.generatedBy).toBe(9);
  });

  it("writes the PDF to files in the same organization and links it", async () => {
    utils.getNextStanceVersionQuery.mockResolvedValue(1);
    utils.createStanceQuery.mockResolvedValue({ id: 9, version: 1 });
    const out = await persistStance(base as any);
    const [file, userId, projectId, source, orgId, transaction] = uploadFile.mock.calls[0];
    expect(file.buffer).toBeInstanceOf(Buffer);
    expect(file.mimetype).toBe("application/pdf");
    expect(userId).toBe(9);
    expect(projectId).toBe(7);
    expect(source).toBe("Bias audit stance report");
    expect(orgId).toBe(42);
    expect(transaction).toBe(tx);
    const [args, createOrg, createTx] = utils.createStanceQuery.mock.calls[0];
    expect(args.pdfFileId).toBe(501);
    expect(args.pdfSha256).toBe(out.sha256);
    expect(createOrg).toBe(42);
    expect(createTx).toBe(tx);
  });

  it("a regenerate inserts the next version", async () => {
    utils.getNextStanceVersionQuery.mockResolvedValue(3);
    utils.createStanceQuery.mockResolvedValue({ id: 10, version: 3 });
    const out = await persistStance(base as any);
    expect(out).toEqual({
      stanceId: 10,
      version: 3,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("the utils module exports no update function for stances", () => {
    // Real module, not the mock: the immutability claim is about the code.
    const real = jest.requireActual("../../../utils/biasAudit.utils") as Record<string, unknown>;
    const stanceWriters = Object.keys(real).filter(
      (k) => /stance/i.test(k) && /^(update|delete|set|upsert)/i.test(k),
    );
    expect(stanceWriters).toEqual([]);
    expect(Object.keys(renderModule)).not.toContain("updateStance");
  });

  it("maps a lost version race to a conflict", async () => {
    utils.getNextStanceVersionQuery.mockResolvedValue(2);
    utils.createStanceQuery.mockRejectedValue({ original: { code: "23505" } });
    await expect(persistStance(base as any)).rejects.toMatchObject({ name: "ConflictException" });
  });

  it("refuses to persist without evidence and writes nothing", async () => {
    await expect(persistStance({ ...base, evidence: undefined } as any)).rejects.toThrow(
      /evidence/i,
    );
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("reads the run's project, scoped to the organization, and files the PDF under it", async () => {
    utils.getRunProjectIdQuery.mockResolvedValue(7);
    utils.getNextStanceVersionQuery.mockResolvedValue(1);
    utils.createStanceQuery.mockResolvedValue({ id: 9, version: 1 });
    await persistStance(base as any);
    expect(utils.getRunProjectIdQuery).toHaveBeenCalledWith(11, 42);
    expect(uploadFile.mock.calls[0][2]).toBe(7);
  });

  it("refuses a project id that does not match the run, before rendering or writing", async () => {
    utils.getRunProjectIdQuery.mockResolvedValue(8);
    await expect(persistStance(base as any)).rejects.toThrow(/project/i);
    expect(getSharedBrowser).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(utils.createStanceQuery).not.toHaveBeenCalled();
  });

  it("does not write anything when the gates forbid export", async () => {
    await expect(
      persistStance({ ...base, evidence: { ...evidence, mayExportPdf: false } } as any),
    ).rejects.toThrow(/export/i);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(utils.createStanceQuery).not.toHaveBeenCalled();
  });

  it("answers the export refusal (422) before the project check (400), reading nothing", async () => {
    utils.getRunProjectIdQuery.mockResolvedValue(8);
    await expect(
      persistStance({ ...base, evidence: { ...evidence, mayExportPdf: false } } as any),
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/export/i) });
    expect(utils.getRunProjectIdQuery).not.toHaveBeenCalled();
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });
});

describe("customer-authored text", () => {
  const withScope = (body: string, customerText: any[]) => ({
    ...model,
    sections: model.sections.map((s: any) =>
      s.key === "scope" ? { ...s, body, customerText } : s,
    ),
  });

  it("renders a project named with a forbidden word, verbatim inside the marker", async () => {
    const m = withScope("Tool: Certified Candidate Ranker.", [
      { lead: "Tool: ", text: "Certified Candidate Ranker", tail: "." },
    ]);
    const html = renderStanceHtml(m, evidence);
    expect(html).toContain("<span data-customer-text>Certified Candidate Ranker</span>");
    expect(findForbiddenWords(html)).toEqual([]);
    await expect(renderThroughPersist(m, evidence, "run")).resolves.toBeDefined();
  });

  it("marks the attestation user's name", async () => {
    const m = { ...model, attestation: { user: "Passed Admin", date: "2026-10-14" } };
    const html = renderStanceHtml(m, evidence);
    expect(html).toContain("<span data-customer-text>Passed Admin</span>");
    await expect(renderThroughPersist(m, evidence, "run")).resolves.toBeDefined();
  });

  it("keeps the attestation date and says the attester is no longer in the organization", () => {
    const html = renderStanceHtml({
      ...model,
      attestation: { user: null, date: "2026-10-14", reason: "departed" },
    });
    expect(html).toContain("Attested on 2026-10-14 by a user no longer in this organization.");
    expect(html).not.toContain("No attestation is recorded.");
    expect(findForbiddenWords(html)).toEqual([]);
  });

  it("labels an attester with no recorded name truthfully, as our own text", () => {
    const html = renderStanceHtml({
      ...model,
      attestation: { user: null, date: "2026-10-14", reason: "unnamed" },
    });
    expect(html).toContain("Attested on 2026-10-14 by a user with no recorded name.");
    expect(html).not.toContain("no longer in this organization");
    expect(html).not.toMatch(/<span data-customer-text>[^<]*no recorded name/);
    expect(findForbiddenWords(html)).toEqual([]);
  });

  it("says no attestation is recorded when there is none", () => {
    expect(renderStanceHtml({ ...model, attestation: null })).toContain(
      "No attestation is recorded.",
    );
  });

  it("marks an answer author's name", () => {
    const m = withScope("Answered by Certified Cara on 2026-10-01.", [
      { lead: "Answered by ", text: "Certified Cara", tail: " on 2026-10-01." },
    ]);
    expect(renderStanceHtml(m, evidence)).toContain(
      "<span data-customer-text>Certified Cara</span>",
    );
  });

  it("marks both strings when the list order is the reverse of the body order", () => {
    const m = withScope('Tool: Alpha.\nIn your words: "Bravo"\nAnswered by Cy on d.', [
      { lead: "Answered by ", text: "Cy", tail: " on d." },
      { lead: `In your words: "`, text: "Bravo", tail: `"` },
      { lead: "Tool: ", text: "Alpha", tail: "." },
    ]);
    const html = renderStanceHtml(m, evidence);
    const a = html.indexOf("<span data-customer-text>Alpha</span>");
    const b = html.indexOf("<span data-customer-text>Bravo</span>");
    const c = html.indexOf("<span data-customer-text>Cy</span>");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("keeps a note with a closing tag and a script inside the marker, escaped and exempt", () => {
    const note = "</blockquote></span><script>alert(1)</script> certified";
    const m = withScope(`In your words: "${note}"`, [
      { lead: `In your words: "`, text: note, tail: `"` },
    ]);
    const html = renderStanceHtml(m, evidence);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain(
      "<span data-customer-text>&lt;/blockquote&gt;&lt;/span&gt;&lt;script&gt;alert(1)&lt;/script&gt; certified</span>",
    );
    expect(findForbiddenWords(html)).toEqual([]);
  });

  it("does not let our own text forge the marker", () => {
    const m = withScope("<span data-customer-text>certified</span>", []);
    const html = renderStanceHtml(m, evidence);
    expect(html).not.toContain("<span data-customer-text>certified</span>");
    expect(findForbiddenWords(html)).toEqual(["certified"]);
  });
});

describe("the vocabulary lint matches whole words", () => {
  const lint = (body: string) =>
    findForbiddenWords(
      renderStanceHtml(
        {
          ...model,
          sections: model.sections.map((s: any) => (s.key === "results" ? { ...s, body } : s)),
        },
        evidence,
      ),
    );

  it("does not flag words that merely contain a forbidden word", () => {
    expect(lint("The test was bypassed. The tool is uncertified. Surpassed.")).toEqual([]);
  });

  it("still flags the words themselves, including the hyphenated one", () => {
    expect(lint("It passed.")).toEqual(["passed"]);
    expect(lint("It is bias-free.")).toEqual(["bias-free"]);
    expect(lint("Non-compliant, Audited!")).toEqual(["compliant", "audited"]);
  });
});

describe("customer-visible labels", () => {
  it("prints a customer-set reference line without claiming the convention", () => {
    const html = renderStanceHtml(model, { ...evidence, thresholdSource: "customer" });
    expect(html).not.toContain("EEOC");
    expect(html).toContain("0.80 (source recorded as customer)");
  });

  it("says when the source or the exclusion is not recorded", () => {
    const html = renderStanceHtml(model, {
      ...evidence,
      thresholdSource: null,
      smallSampleExclusion: null,
    });
    expect(html).toContain("0.80 (source not recorded)");
    expect(html).toContain("Small-sample exclusion</dt><dd>not recorded");
  });

  it("never prints the slug of an unknown preset or metric", () => {
    const html = renderStanceHtml(model, {
      ...evidence,
      presetId: "some_preset",
      metric: "odd_rate",
    });
    expect(html).toContain("Some preset");
    expect(html).toContain("Odd rate");
  });
});

/** An out-of-scope model with only the four sections the document carries. */
const oosModel: any = {
  ...model,
  heading: "Scope determination",
  scope: "out_of_scope",
  sections: model.sections.filter((s: any) =>
    ["scope", "party", "open_items", "expiry"].includes(s.key),
  ),
  blankFields: [],
  openItems: [],
  expiry: { date: null, trigger: "" },
};

describe("a scope determination has no dataset", () => {
  it("renders an out-of-scope document without run evidence", async () => {
    await expect(renderThroughPersist(oosModel, null, "profile")).resolves.toMatchObject({
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("refuses an out-of-scope run model without evidence: the parent is required", async () => {
    await expect(renderThroughPersist(oosModel, null, "run")).rejects.toMatchObject({
      statusCode: 422,
      message: "A stance PDF cannot be rendered without the run's evidence.",
    });
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("still refuses an in-scope or undetermined document without evidence", async () => {
    for (const scope of ["in_scope", "undetermined"]) {
      await expect(
        renderThroughPersist({ ...model, scope }, null, "profile"),
      ).rejects.toMatchObject({
        name: "BusinessLogicException",
        statusCode: 422,
      });
    }
    expect(getSharedBrowser).not.toHaveBeenCalled();
  });

  it("does not claim figures were computed from a file", () => {
    const html = renderStanceHtml(oosModel, null);
    expect(html).not.toMatch(/figures computed/i);
    expect(html).toContain("No file was supplied and no figures were computed.");
    expect(html).toContain("This document is not a Local Law 144 bias audit.");
    expect(html).toContain("The scope determination belongs to the party that answered.");
  });
});

describe("the footer follows the run evidence, not the scope", () => {
  const RUN_FOOTER =
    "It records the answers given and the figures computed from the file supplied, as given.";
  const NO_FILE_FOOTER = "No file was supplied and no figures were computed.";

  it("an out-of-scope run stance, which has evidence, keeps the run wording", () => {
    const html = renderStanceHtml(oosModel, evidence);
    expect(html).toContain(RUN_FOOTER);
    expect(html).not.toContain(NO_FILE_FOOTER);
    // The scope sentence follows the scope, not the evidence.
    expect(html).toContain("The scope determination belongs to the party that answered.");
  });

  it("a document rendered without evidence says no file was supplied, whatever its scope", () => {
    const html = renderStanceHtml(model, null);
    expect(html).toContain(NO_FILE_FOOTER);
    expect(html).not.toContain(RUN_FOOTER);
    expect(html).not.toContain("The scope determination belongs to the party that answered.");
  });
});

describe("persistStance from an attested profile", () => {
  const base = {
    profileId: 5,
    projectId: 7,
    organizationId: 42,
    userId: 9,
    model: oosModel,
    evidence: null,
    scoreAtGeneration: null,
  };

  beforeEach(() => {
    uploadFile.mockResolvedValue({ id: 501 });
    utils.checkProfileAttestedQuery.mockResolvedValue(undefined);
    utils.assertProfileAttestedQuery.mockResolvedValue(undefined);
    utils.getNextProfileStanceVersionQuery.mockResolvedValue(1);
    utils.createProfileStanceQuery.mockResolvedValue({ id: 30, version: 1 });
  });

  it("files the PDF as a stance file under the profile's project and links it to the profile", async () => {
    const out = await persistStance(base);
    // No re-read of the profile: the service loaded the attested profile, and
    // the insert refuses one that is no longer attested or not the project's.
    expect(utils.getProfileByIdQuery).not.toHaveBeenCalled();
    expect(utils.getNextProfileStanceVersionQuery).toHaveBeenCalledWith(5, 42, tx);
    const [file, userId, projectId, source, orgId, transaction] = uploadFile.mock.calls[0];
    expect(file.originalname).toBe("bias-audit-scope-determination-profile-5-v1.pdf");
    expect(file.mimetype).toBe("application/pdf");
    expect([userId, projectId, source, orgId, transaction]).toEqual([
      9,
      7,
      "Bias audit stance report",
      42,
      tx,
    ]);
    const [row, createOrg, createTx] = utils.createProfileStanceQuery.mock.calls[0];
    expect(row).toEqual({
      profileId: 5,
      projectId: 7,
      version: 1,
      pdfSha256: out.sha256,
      pdfFileId: 501,
      scopeAtGeneration: "out_of_scope",
      generatedBy: 9,
    });
    expect([createOrg, createTx]).toEqual([42, tx]);
    expect(utils.createStanceQuery).not.toHaveBeenCalled();
    expect(utils.getRunProjectIdQuery).not.toHaveBeenCalled();
    expect(utils.getNextStanceVersionQuery).not.toHaveBeenCalled();
    expect(out).toEqual({ stanceId: 30, version: 1, sha256: expect.any(String) });
  });

  it("checks the cited profile with an unlocked read before rendering, and refuses without launching a browser", async () => {
    const { ConflictException, NotFoundException } = jest.requireActual(
      "../../../domain.layer/exceptions/custom.exception",
    );
    await persistStance(base);
    // The pre-render check is the plain read, outside any transaction; the
    // FOR SHARE check runs only once, inside it.
    expect(utils.checkProfileAttestedQuery.mock.calls).toEqual([[5, 7, 42]]);
    expect(utils.checkProfileAttestedQuery.mock.invocationCallOrder[0]).toBeLessThan(
      getSharedBrowser.mock.invocationCallOrder[0],
    );
    expect(utils.assertProfileAttestedQuery.mock.calls).toEqual([[5, 7, 42, tx]]);
    expect(utils.assertProfileAttestedQuery.mock.invocationCallOrder[0]).toBeGreaterThan(
      getSharedBrowser.mock.invocationCallOrder[0],
    );

    jest.clearAllMocks();
    for (const refusal of [
      new NotFoundException("Profile 5 was not found in this organization", "Profile"),
      new ConflictException("The profile was re-attested while the document was being generated."),
    ]) {
      utils.checkProfileAttestedQuery.mockRejectedValueOnce(refusal);
      await expect(persistStance(base)).rejects.toBe(refusal);
    }
    expect(getSharedBrowser).not.toHaveBeenCalled();
    expect(utils.assertProfileAttestedQuery).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(utils.createProfileStanceQuery).not.toHaveBeenCalled();
  });

  it("locks the profile, then reads the version, then writes, all in one transaction", async () => {
    await persistStance(base);
    expect(utils.assertProfileAttestedQuery.mock.calls[0]).toEqual([5, 7, 42, tx]);
    const order = [
      utils.assertProfileAttestedQuery.mock.invocationCallOrder[0],
      utils.getNextProfileStanceVersionQuery.mock.invocationCallOrder[0],
      uploadFile.mock.invocationCallOrder[0],
      utils.createProfileStanceQuery.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names the next version in the file", async () => {
    utils.getNextProfileStanceVersionQuery.mockResolvedValue(2);
    utils.createProfileStanceQuery.mockResolvedValue({ id: 31, version: 2 });
    expect(await persistStance(base)).toMatchObject({ stanceId: 31, version: 2 });
    expect(uploadFile.mock.calls[0][0].originalname).toBe(
      "bias-audit-scope-determination-profile-5-v2.pdf",
    );
  });

  it("maps a lost version race to a conflict that names the profile", async () => {
    utils.createProfileStanceQuery.mockRejectedValue({ original: { code: "23505" } });
    await expect(persistStance(base)).rejects.toMatchObject({
      name: "ConflictException",
      message: expect.stringMatching(/profile/i),
    });
  });

  it("refuses an in-scope or undetermined document without evidence, writing nothing", async () => {
    // The service answers the scope rule first (422, "comes from a run"); this
    // is the one evidence check that remains here.
    for (const m of [model, { ...model, scope: "undetermined" }]) {
      await expect(persistStance({ ...base, model: m })).rejects.toMatchObject({
        statusCode: 422,
        message: "A stance PDF cannot be rendered without the run's evidence.",
      });
    }
    expect(getSharedBrowser).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    // The evidence refusal comes before any database read.
    for (const query of Object.values(utils)) expect(query).not.toHaveBeenCalled();
  });

  it("passes the insert's not-found and re-attestation conflict through unchanged", async () => {
    const { ConflictException, NotFoundException } = jest.requireActual(
      "../../../domain.layer/exceptions/custom.exception",
    );
    utils.createProfileStanceQuery.mockRejectedValueOnce(
      new NotFoundException("Profile 5 was not found in this organization", "Profile"),
    );
    await expect(persistStance(base)).rejects.toMatchObject({ statusCode: 404 });
    utils.createProfileStanceQuery.mockRejectedValueOnce(
      new ConflictException(
        "The profile was re-attested while the document was being generated. Reload and retry.",
        "AedtProfile",
        "status",
      ),
    );
    await expect(persistStance(base)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/re-attested/),
    });
  });

  it("keeps a run stance fail-closed without evidence, even for an out-of-scope model", async () => {
    await expect(
      persistStance({ ...base, profileId: undefined, runId: 11, model: oosModel } as any),
    ).rejects.toThrow(/evidence/i);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("the rendered scope determination", () => {
  // Built the way the service builds it: real answers through the real gates,
  // readiness and composition, then rendered.
  const answers = {
    "role.party": { value: "employer", notes: "We hire with it.", dontKnow: false },
    "scope.weighting": {
      value: "one_of_several",
      notes: "Recruiters read the score beside the interview notes.",
      dontKnow: false,
    },
    "independence.auditor": { value: "self", notes: "Our HR team.", dontKnow: false },
    "data.held": { value: "none", notes: "We hold none.", dontKnow: false },
  };
  const answerAuthors = Object.fromEntries(
    Object.keys(answers).map((k) => [k, { user: "Ada Admin", date: "2026-10-01" }]),
  );
  const readiness = computeReadiness(answers);
  const doc = composeStance({
    projectName: "Screener",
    readiness,
    gates: runAnswerGates(answers),
    answers,
    answerAuthors,
    result: null,
    gateFindings: [],
    order: [],
    expiry: { date: null, trigger: "" },
    derivedBasis: null,
    attestation: { user: "Grace Admin", date: "2026-10-02" },
    jobDescriptionKey: null,
  });
  const html = renderStanceHtml(doc, null);
  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  it("is an out-of-scope determination with no score", () => {
    expect(readiness.scope).toBe("out_of_scope");
    expect(readiness.score).toBeNull();
  });

  it("is headed Scope determination", () => {
    expect(html).toMatch(/<h1>Scope determination<\/h1>/);
    expect(text).not.toMatch(/\bResult\b/);
  });

  it("quotes the customer's determination with who answered and when", () => {
    expect(text).toContain(
      'In your words: "Recruiters read the score beside the interview notes."',
    );
    expect(text).toContain("Answered by Ada Admin on 2026-10-01.");
  });

  it("names the attesting user and the date", () => {
    expect(text).toContain("Attested by Grace Admin on 2026-10-02.");
  });

  it("names the 5-300 limb relied on", () => {
    expect(text).toMatch(/falls outside the 5-300 definition/);
  });

  it("says VerifyWise did not verify it and does not determine AEDT status", () => {
    expect(text).toContain("VerifyWise did not verify this");
    expect(text).toMatch(
      /does not determine whether any deployment is an automated employment decision tool/,
    );
  });

  it("says a change in use may bring the tool into scope", () => {
    expect(text).toContain("A change in how the output is used may bring the tool into scope.");
  });

  it("carries no ratio, rate, score, dataset or figures text", () => {
    expect(text).not.toMatch(
      /impact ratio|selection rate|scoring rate|readiness score|0\.80|four-fifths|SHA-256|figures computed|individuals/i,
    );
  });

  it("passes the vocabulary lint and carries the four required sections", () => {
    expect(findForbiddenWords(html)).toEqual([]);
    expect(checkSections(html, ["scope", "party", "open_items", "expiry"]).ok).toBe(true);
  });
});
