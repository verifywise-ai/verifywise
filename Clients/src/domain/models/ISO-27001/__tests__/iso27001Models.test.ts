import { describe, it, expect } from "vitest";
import { ISO27001AnnexControlModel } from "../ISO27001AnnexControl/ISO27001AnnexControl.model";
import { ISO27001AnnexControlRiskModel } from "../ISO27001AnnexControlRisk/ISO27001AnnexControlRisk.model";
import { ISO27001AnnexControlStructModel } from "../ISO27001AnnexControlStruct/ISO27001AnnexControlStruct.model";
import { ISO27001AnnexStructModel } from "../ISO27001AnnexStruct/ISO27001AnnexStruct.model";
import { ISO27001ClauseStructModel } from "../ISO27001ClauseStruct/ISO27001ClauseStruct.model";
import { ISO27001SubClauseModel } from "../ISO27001SubClause/ISO27001SubClause.model";
import { ISO27001SubClauseRiskModel } from "../ISO27001SubClauseRisk/ISO27001SubClauseRisk.model";
import { ISO27001SubClauseStructModel } from "../ISO27001SubClauseStruct/ISO27001SubClauseStruct.model";

describe("ISO27001AnnexControlModel", () => {
  const data = {
    id: 1,
    implementation_description: "Implemented via SSO",
    evidence_links: [{ url: "https://example.com" }],
    status: "Done",
    owner: 1,
    reviewer: 2,
    approver: 3,
    due_date: new Date(),
    auditor_feedback: "Looks good",
    annexcontrol_meta_id: 10,
    projects_frameworks_id: 5,
    created_at: new Date(),
    is_demo: false,
  } as ISO27001AnnexControlModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001AnnexControlModel(data);
    expect(model.implementation_description).toBe("Implemented via SSO");
    expect(model.owner).toBe(1);
    expect(model.is_demo).toBe(false);
  });

  it("static factory returns instance", () => {
    const model = ISO27001AnnexControlModel.createNewISO27001AnnexControl(data);
    expect(model).toBeInstanceOf(ISO27001AnnexControlModel);
  });
});

describe("ISO27001AnnexControlRiskModel", () => {
  const data = { annexcontrol_id: 1, projects_risks_id: 5 } as ISO27001AnnexControlRiskModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001AnnexControlRiskModel(data);
    expect(model.annexcontrol_id).toBe(1);
    expect(model.projects_risks_id).toBe(5);
  });

  it("static factory returns instance", () => {
    const model = ISO27001AnnexControlRiskModel.createNewISO27001AnnexControlRisk(data);
    expect(model).toBeInstanceOf(ISO27001AnnexControlRiskModel);
  });
});

describe("ISO27001AnnexControlStructModel", () => {
  const data = {
    id: 1,
    title: "A.5.1",
    order_no: 1,
    requirement_summary: "Policies for information security",
    key_questions: ["Is there a policy?"],
    evidence_examples: ["Policy document"],
    annex_id: 10,
  } as ISO27001AnnexControlStructModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001AnnexControlStructModel(data);
    expect(model.title).toBe("A.5.1");
    expect(model.key_questions).toHaveLength(1);
  });

  it("static factory returns instance", () => {
    const model = ISO27001AnnexControlStructModel.createNewISO27001AnnexControlStruct(data);
    expect(model).toBeInstanceOf(ISO27001AnnexControlStructModel);
  });
});

describe("ISO27001AnnexStructModel", () => {
  const data = {
    id: 1,
    arrangement: 5,
    title: "Annex A.5",
    order_no: 1,
    framework_id: 2,
  } as ISO27001AnnexStructModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001AnnexStructModel(data);
    expect(model.arrangement).toBe(5);
    expect(model.title).toBe("Annex A.5");
  });

  it("static factory returns instance", () => {
    const model = ISO27001AnnexStructModel.createNewISO27001AnnexStruct(data);
    expect(model).toBeInstanceOf(ISO27001AnnexStructModel);
  });
});

describe("ISO27001ClauseStructModel", () => {
  const data = {
    id: 1,
    arrangement: 4,
    title: "Context of the organization",
    framework_id: 2,
  } as ISO27001ClauseStructModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001ClauseStructModel(data);
    expect(model.title).toBe("Context of the organization");
  });

  it("static factory returns instance", () => {
    const model = ISO27001ClauseStructModel.createNewISO27001ClauseStruct(data);
    expect(model).toBeInstanceOf(ISO27001ClauseStructModel);
  });
});

describe("ISO27001SubClauseModel", () => {
  const data = {
    id: 1,
    implementation_description: "Implemented",
    evidence_links: [],
    status: "In progress",
    owner: 1,
    reviewer: 2,
    approver: 3,
    due_date: new Date(),
    auditor_feedback: "",
    subclause_meta_id: 10,
    projects_frameworks_id: 5,
    created_at: new Date(),
    is_demo: false,
  } as ISO27001SubClauseModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001SubClauseModel(data);
    expect(model.implementation_description).toBe("Implemented");
    expect(model.subclause_meta_id).toBe(10);
  });

  it("static factory returns instance", () => {
    const model = ISO27001SubClauseModel.createNewISO27001SubClause(data);
    expect(model).toBeInstanceOf(ISO27001SubClauseModel);
  });
});

describe("ISO27001SubClauseRiskModel", () => {
  const data = { subclause_id: 3, projects_risks_id: 7 } as ISO27001SubClauseRiskModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001SubClauseRiskModel(data);
    expect(model.subclause_id).toBe(3);
    expect(model.projects_risks_id).toBe(7);
  });

  it("static factory returns instance", () => {
    const model = ISO27001SubClauseRiskModel.createNewISO27001SubClauseRisk(data);
    expect(model).toBeInstanceOf(ISO27001SubClauseRiskModel);
  });
});

describe("ISO27001SubClauseStructModel", () => {
  const data = {
    id: 1,
    title: "4.1",
    order_no: 1,
    requirement_summary: "Understanding the organization",
    key_questions: ["What internal factors?"],
    evidence_examples: ["SWOT analysis"],
    clause_id: 4,
  } as ISO27001SubClauseStructModel;

  it("constructor copies all fields", () => {
    const model = new ISO27001SubClauseStructModel(data);
    expect(model.title).toBe("4.1");
    expect(model.evidence_examples).toHaveLength(1);
  });

  it("static factory returns instance", () => {
    const model = ISO27001SubClauseStructModel.createNewISO27001SubClauseStruct(data);
    expect(model).toBeInstanceOf(ISO27001SubClauseStructModel);
  });
});
