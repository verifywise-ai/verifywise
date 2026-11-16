import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../frameworkImpl.utils", () => ({ getImplByIdQuery: jest.fn() }));
jest.mock("../../extensions/framework-import/importedAssessment.service", () => ({
  getImplQuery: jest.fn(),
  parseLevel: (raw: unknown) => (raw === "l2" || raw === "l3" ? raw : null),
}));

import {
  detectEuAnswerChanges,
  detectEuControlChanges,
  detectFlatChanges,
  euAnswerChanges,
  euControlChanges,
  frameworkImplChanges,
  IMPL_RULES,
  iso42001SubclauseChanges,
  ISO42001_ANNEX_RULES,
  ISO_NIST_RULES,
  normalizeText,
  restoreEuControlFields,
  restoreFlatFields,
  riskLinksChanged,
} from "../frameworkWriteAccess.utils";

const stored = {
  implementation_description: "We review the model monthly & log results.",
  status: "In progress",
  owner: 3,
  reviewer: null,
  approver: 5,
  due_date: new Date("2026-03-10T00:00:00.000Z"),
  auditor_feedback: null,
  risks: [11, 12],
};

/** What a drawer sends when the user only changed `overrides`. */
const drawerSave = (overrides: Record<string, unknown> = {}) => ({
  implementation_description: "<p>We review the model monthly &amp; log results.</p>",
  status: "In progress",
  owner: "3",
  reviewer: "",
  approver: "5",
  due_date: "2026-03-09T23:00:00.000Z",
  auditor_feedback: "",
  user_id: "7",
  project_id: "1",
  delete: "[]",
  risksMitigated: "[]",
  risksDelete: "[]",
  ...overrides,
});

describe("normalizeText", () => {
  it("compares rich text by its text", () => {
    expect(normalizeText("<p>a &lt; b</p><p>c&nbsp;d</p>")).toBe("a < b c d");
    expect(normalizeText("a < b\n\nc d")).toBe("a < b c d");
  });

  it("reads missing values as empty", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText("undefined")).toBe("");
    expect(normalizeText("<p></p>")).toBe("");
  });
});

describe("riskLinksChanged", () => {
  it("is false when the full current list is resent (inline status dropdown)", () => {
    expect(riskLinksChanged("[11,12]", "[]", [11, 12])).toBe(false);
  });

  it("is true when a risk is added or removed", () => {
    expect(riskLinksChanged("[13]", "[]", [11, 12])).toBe(true);
    expect(riskLinksChanged("[]", "[12]", [11, 12])).toBe(true);
  });

  it("ignores removing a risk that is not linked", () => {
    expect(riskLinksChanged("[]", "[99]", [11, 12])).toBe(false);
  });

  it("fails closed on input it cannot read", () => {
    expect(riskLinksChanged("not json", "[]", [])).toBe(true);
    expect(riskLinksChanged('["x"]', "[]", [])).toBe(true);
  });
});

describe("detectFlatChanges (ISO, NIST)", () => {
  it("finds no change in an unchanged save (Reviewer pressing save)", () => {
    expect(detectFlatChanges(drawerSave(), [], stored, ISO_NIST_RULES)).toEqual({
      edit: false,
      audit: false,
    });
  });

  it("classes auditor feedback as audit only (Auditor recording a result)", () => {
    const body = drawerSave({ auditor_feedback: "Evidence checked, control works." });
    expect(detectFlatChanges(body, [], stored, ISO_NIST_RULES)).toEqual({
      edit: false,
      audit: true,
    });
  });

  it.each([
    ["implementation text", { implementation_description: "<p>New text</p>" }],
    ["status", { status: "Implemented" }],
    ["owner", { owner: "4" }],
    ["owner cleared", { owner: "" }],
    ["due date moved", { due_date: "2026-04-01" }],
    ["evidence unlinked", { delete: "[42]" }],
    ["risk linked", { risksMitigated: "[13]" }],
  ])("classes a %s change as edit", (_label, overrides) => {
    expect(detectFlatChanges(drawerSave(overrides), [], stored, ISO_NIST_RULES).edit).toBe(true);
  });

  it("classes an evidence upload as edit", () => {
    const changes = detectFlatChanges(
      drawerSave(),
      [{ fieldname: "files" }],
      stored,
      ISO_NIST_RULES,
    );
    expect(changes).toEqual({ edit: true, audit: false });
  });

  it("allows a day of slack on due dates sent in the browser's time zone", () => {
    expect(
      detectFlatChanges(drawerSave({ due_date: "Mon, 09 Mar 2026 05:00:00 GMT" }), [], stored, {
        ...ISO_NIST_RULES,
      }).edit,
    ).toBe(false);
    expect(
      detectFlatChanges(drawerSave({ due_date: "2026-03-11" }), [], stored, ISO_NIST_RULES).edit,
    ).toBe(false);
  });

  it("treats values the ISO query skips as no change", () => {
    const body = drawerSave({ implementation_description: "", status: "", owner: "undefined" });
    expect(detectFlatChanges(body, [], stored, ISO_NIST_RULES).edit).toBe(false);
  });

  it("reads an empty stored status as the default the ISO 27001 drawer sends", () => {
    const body = drawerSave({ status: "Not started" });
    expect(detectFlatChanges(body, [], { ...stored, status: null }, ISO_NIST_RULES).edit).toBe(
      false,
    );
  });

  it("checks applicability on ISO 42001 annexes", () => {
    const annex = { ...stored, is_applicable: true, justification_for_exclusion: null };
    expect(
      detectFlatChanges(drawerSave({ is_applicable: "true" }), [], annex, ISO42001_ANNEX_RULES)
        .edit,
    ).toBe(false);
    expect(
      detectFlatChanges(drawerSave({ is_applicable: "false" }), [], annex, ISO42001_ANNEX_RULES)
        .edit,
    ).toBe(true);
  });

  it("counts a JSON null as clearing the field (the ISO and NIST queries write it)", () => {
    for (const field of ["due_date", "status"]) {
      expect(
        detectFlatChanges(drawerSave({ [field]: null }), [], stored, ISO_NIST_RULES).edit,
      ).toBe(true);
    }
    const annex = { ...stored, is_applicable: true, justification_for_exclusion: null };
    expect(
      detectFlatChanges(drawerSave({ is_applicable: null }), [], annex, ISO42001_ANNEX_RULES).edit,
    ).toBe(true);
    expect(detectFlatChanges(drawerSave({ reviewer: null }), [], stored, ISO_NIST_RULES).edit).toBe(
      false,
    );
  });

  it("fails closed on an unreadable unlink list", () => {
    expect(detectFlatChanges(drawerSave({ delete: "{" }), [], stored, ISO_NIST_RULES).edit).toBe(
      true,
    );
  });
});

describe("detectFlatChanges (bundled and imported frameworks)", () => {
  it("treats an empty text as clearing it", () => {
    const body = { implementation_description: "" };
    expect(detectFlatChanges(body, [], stored, IMPL_RULES).edit).toBe(true);
    expect(
      detectFlatChanges(body, [], { ...stored, implementation_description: null }, IMPL_RULES).edit,
    ).toBe(false);
  });

  it("finds no change in a status-only save that keeps the status", () => {
    expect(detectFlatChanges({ status: "In progress" }, [], stored, IMPL_RULES)).toEqual({
      edit: false,
      audit: false,
    });
  });
});

describe("detectEuControlChanges", () => {
  const control = {
    owner: 3,
    reviewer: null,
    approver: null,
    due_date: "2026-03-10",
    risk_review: null,
  };
  const subcontrol = {
    id: 21,
    status: "Waiting",
    implementation_details: "Done in Q1",
    evidence_description: null,
    feedback_description: null,
    risks: [],
  };
  const snapshot = {
    control,
    subcontrols: new Map([[21, subcontrol]]),
    feedbackFileIds: new Set([90]),
  };
  const save = (sc: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    owner: "3",
    reviewer: "",
    approver: "",
    risk_review: "",
    due_date: "2026-03-10",
    subControls: JSON.stringify([
      {
        id: 21,
        status: "Waiting",
        implementation_details: "<p>Done in Q1</p>",
        evidence_description: "",
        feedback_description: "",
        risksDelete: "[]",
        risksMitigated: "[]",
        ...sc,
      },
    ]),
    delete: "[]",
    ...extra,
  });

  it("finds no change in an unchanged save", () => {
    expect(detectEuControlChanges(save(), [], snapshot)).toEqual({ edit: false, audit: false });
  });

  it("classes feedback text and feedback files as audit", () => {
    expect(
      detectEuControlChanges(save({ feedback_description: "Looks right" }), [], snapshot),
    ).toEqual({ edit: false, audit: true });
    expect(detectEuControlChanges(save(), [{ fieldname: "feedback_files_21" }], snapshot)).toEqual({
      edit: false,
      audit: true,
    });
  });

  it("classes evidence files and implementation fields as edit", () => {
    expect(
      detectEuControlChanges(save(), [{ fieldname: "evidence_files_21" }], snapshot).edit,
    ).toBe(true);
    expect(detectEuControlChanges(save({ status: "Done" }), [], snapshot).edit).toBe(true);
    expect(detectEuControlChanges(save({}, { owner: "" }), [], snapshot).edit).toBe(true);
  });

  it("classes unlinking by which kind of file it is", () => {
    expect(detectEuControlChanges(save({}, { delete: "[90]" }), [], snapshot)).toEqual({
      edit: false,
      audit: true,
    });
    expect(detectEuControlChanges(save({}, { delete: "[91]" }), [], snapshot)).toEqual({
      edit: true,
      audit: false,
    });
  });

  it("fails closed on unreadable subcontrols", () => {
    expect(detectEuControlChanges(save({}, { subControls: "{" }), [], snapshot).edit).toBe(true);
  });

  it.each(["+21", "0x15", "21.0"])(
    "fails closed on a subcontrol id Postgres may still read (%s)",
    (id) => {
      expect(detectEuControlChanges(save({ id }), [], snapshot)).toEqual({
        edit: true,
        audit: true,
      });
    },
  );
});

describe("detectEuAnswerChanges", () => {
  const answer = { answer: "<p>Yes, documented.</p>", risks: [4] };

  it("does not count a status change (assessment tracker, any role)", () => {
    const body = { status: "Done", delete: "[]", risksDelete: "[]", risksMitigated: "[]" };
    expect(detectEuAnswerChanges(body, [], answer)).toEqual({ edit: false, audit: false });
  });

  it("classes answer text, evidence and risks as edit", () => {
    expect(detectEuAnswerChanges({ answer: "No" }, [], answer).edit).toBe(true);
    expect(detectEuAnswerChanges({}, [{ fieldname: "files" }], answer).edit).toBe(true);
    expect(detectEuAnswerChanges({ risksDelete: "[4]" }, [], answer).edit).toBe(true);
  });
});

describe("route ids the detector cannot read", () => {
  // The controllers parseInt the id ("21x" and "+21" both save row 21), so
  // an id toId rejects must not read as "no change".
  const req = (params: Record<string, string>) => ({ params, body: {}, organizationId: 1 }) as any;

  it.each(["21x", "+21"])("fails closed on :id %s", async (id) => {
    const all = { edit: true, audit: true };
    await expect(iso42001SubclauseChanges(req({ id }))).resolves.toEqual(all);
    await expect(euControlChanges(req({ id }))).resolves.toEqual(all);
    await expect(euAnswerChanges(req({ id }))).resolves.toEqual(all);
    await expect(frameworkImplChanges(req({ frameworkId: "5", level: "l2", id }))).resolves.toEqual(
      all,
    );
  });
});

describe("restoring unchanged fields", () => {
  it("removes only the flat fields of the class", () => {
    const body: Record<string, unknown> = drawerSave({ is_applicable: "true" });
    restoreFlatFields(body, ISO42001_ANNEX_RULES, "audit");
    expect(body).not.toHaveProperty("auditor_feedback");
    expect(body.implementation_description).toBeDefined();
    restoreFlatFields(body, ISO42001_ANNEX_RULES, "edit");
    for (const field of ["implementation_description", "status", "owner", "due_date"]) {
      expect(body).not.toHaveProperty(field);
    }
    expect(body).not.toHaveProperty("is_applicable");
    expect(body.risksMitigated).toBe("[]");
  });

  it("keeps an array subControls an array and leaves control fields alone without a stored control", () => {
    const body: Record<string, unknown> = {
      owner: "9",
      subControls: [{ id: 1, implementation_details: "x", feedback_description: "y" }],
    };
    const snapshot = { control: null, subcontrols: new Map(), feedbackFileIds: new Set<number>() };
    restoreEuControlFields(body, snapshot, "edit");
    expect(body).toEqual({ owner: "9", subControls: [{ id: 1, feedback_description: "y" }] });
  });
});
