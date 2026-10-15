const utils = {
  createStanceQuery: jest.fn(),
  getNextStanceVersionQuery: jest.fn(),
};
jest.mock("../../../utils/biasAudit.utils", () => utils);

const uploadFile = jest.fn();
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile }));

const tx = { id: "tx" };
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}));

const pdfMock = jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
const launch = jest.fn();
jest.mock("playwright", () => ({ chromium: { launch } }));

import { checkSections } from "./sectionChecker";
import { renderStanceHtml, renderStancePdf, persistStance, findForbiddenWords } from "./render";
import type { StanceEvidence } from "./render";
import { REQUIRED_SECTIONS } from "./compose";
import * as renderModule from "./render";

const model: any = {
  heading: "Bias testing result",
  scope: "in_scope",
  sections: REQUIRED_SECTIONS.map((k) => ({ key: k, title: k, body: `body of ${k}` })),
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
  launch.mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: pdfMock,
      close: jest.fn(),
    }),
    close: jest.fn(),
  });
});

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
    expect(html).toContain("distribution_date");
    expect(html).toContain("To be completed by the deploying employer.");
    expect(html).toMatch(/not a Local Law 144 bias audit/i);
  });

  it("shows the dataset hash and what was tested", () => {
    const html = renderStanceHtml(model, evidence);
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("1234");
    expect(html).toContain("selection_rate");
    expect(html).toContain("0.80");
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
            quotes: ["We were audited last year"],
          }
        : s,
    ),
  };

  it("renders a customer note verbatim in a marked element, and the lint skips it", () => {
    const html = renderStanceHtml(quoted, evidence);
    expect(html).toMatch(/<blockquote data-customer-quote[^>]*>[^<]*We were audited last year/);
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
    await expect(renderStancePdf(own, evidence)).rejects.toThrow(/forbidden/i);
    expect(launch).not.toHaveBeenCalled();
  });

  it("renders a PDF for a stance that quotes the word", async () => {
    await expect(renderStancePdf(quoted, evidence)).resolves.toBeDefined();
  });
});

describe("renderStancePdf", () => {
  it("returns a buffer and its sha256", async () => {
    const out = await renderStancePdf(model, evidence);
    expect(out.pdf).toBeInstanceOf(Buffer);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to render when a required section is absent, before launching a browser", async () => {
    const broken = { ...model, sections: model.sections.slice(0, 2) };
    await expect(renderStancePdf(broken, evidence)).rejects.toThrow(/missing required section/i);
    expect(launch).not.toHaveBeenCalled();
  });

  it("refuses to render when the gates do not allow export", async () => {
    await expect(renderStancePdf(model, { ...evidence, mayExportPdf: false })).rejects.toThrow(
      /export/i,
    );
    expect(launch).not.toHaveBeenCalled();
  });

  it("accepts the narrower section list of an out-of-scope determination", async () => {
    const out = {
      ...model,
      scope: "out_of_scope",
      sections: model.sections.filter((s: any) =>
        ["scope", "party", "open_items", "expiry"].includes(s.key),
      ),
    };
    await expect(renderStancePdf(out)).resolves.toBeDefined();
  });

  it("closes the browser even when the PDF step fails", async () => {
    const close = jest.fn();
    launch.mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn(),
        pdf: jest.fn().mockRejectedValue(new Error("boom")),
        close: jest.fn(),
      }),
      close,
    });
    await expect(renderStancePdf(model, evidence)).rejects.toThrow("boom");
    expect(close).toHaveBeenCalled();
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

  it("does not write anything when the gates forbid export", async () => {
    await expect(
      persistStance({ ...base, evidence: { ...evidence, mayExportPdf: false } } as any),
    ).rejects.toThrow(/export/i);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(utils.createStanceQuery).not.toHaveBeenCalled();
  });
});
