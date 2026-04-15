import { describe, it, expect } from "vitest";
import { AnnexCategoryISO42001Model } from "../annexCategoryISO42001/annexCategoryISO42001.model";
import { AnnexCategoryISO42001RiskModel } from "../annexCategoryISO42001RIsk/annexCategoryISO42001RIsk.model";
import { AnnexCategoryStructISO42001Model } from "../annexCategoryStructISO42001/annexCategoryStructISO42001.model";
import { AnnexStructISO42001Model } from "../annexStructISO42001/annexStructISO42001.model";
import { ClauseStructISO42001Model } from "../clauseStructISO42001/clauseStructISO42001.model";
import { SubClauseISO42001Model } from "../subClauseISO42001/subClauseISO42001.model";
import { SubClauseISO42001RiskModel } from "../subClauseISO42001Risk/subClauseISO42001Risk.model";
import { SubClauseStructISO42001Model } from "../subClauseStructISO42001/subClauseStructISO42001.model";

describe("AnnexCategoryISO42001Model", () => {
  const data = {
    id: 1,
    is_applicable: true,
    implementation_description: "Implemented",
    evidence_links: [],
    status: "Implemented" as const,
    owner: 1,
    reviewer: 2,
    approver: 3,
    due_date: new Date(),
    auditor_feedback: "",
    projects_frameworks_id: 5,
    annexcategory_meta_id: 10,
    created_at: new Date(),
    is_demo: false,
  } as AnnexCategoryISO42001Model;

  it("constructor copies all fields", () => {
    const model = new AnnexCategoryISO42001Model(data);
    expect(model.is_applicable).toBe(true);
    expect(model.implementation_description).toBe("Implemented");
  });

  it("static factory returns instance", () => {
    const model = AnnexCategoryISO42001Model.createNewAnnexCategoryISO42001(data);
    expect(model).toBeInstanceOf(AnnexCategoryISO42001Model);
  });
});

describe("AnnexCategoryISO42001RiskModel", () => {
  const data = { annexcategory_id: 1, projects_risks_id: 5 } as AnnexCategoryISO42001RiskModel;

  it("constructor copies all fields", () => {
    const model = new AnnexCategoryISO42001RiskModel(data);
    expect(model.annexcategory_id).toBe(1);
    expect(model.projects_risks_id).toBe(5);
  });

  it("static factory returns instance", () => {
    const model = AnnexCategoryISO42001RiskModel.createNewAnnexCategoryISO42001Risk(data);
    expect(model).toBeInstanceOf(AnnexCategoryISO42001RiskModel);
  });
});

describe("AnnexCategoryStructISO42001Model", () => {
  const data = {
    id: 1,
    title: "A.2.1",
    description: "AI policy",
    guidance: "Establish AI governance",
    sub_id: 2,
    order_no: 1,
    annex_id: 5,
  } as AnnexCategoryStructISO42001Model;

  it("constructor copies all fields", () => {
    const model = new AnnexCategoryStructISO42001Model(data);
    expect(model.title).toBe("A.2.1");
    expect(model.guidance).toBe("Establish AI governance");
  });

  it("static factory returns instance", () => {
    const model = AnnexCategoryStructISO42001Model.createNewAnnexCategoryStructISO42001(data);
    expect(model).toBeInstanceOf(AnnexCategoryStructISO42001Model);
  });
});

describe("AnnexStructISO42001Model", () => {
  const data = { id: 1, title: "Annex A", annex_no: 1, framework_id: 3 } as AnnexStructISO42001Model;

  it("constructor copies all fields", () => {
    const model = new AnnexStructISO42001Model(data);
    expect(model.title).toBe("Annex A");
    expect(model.annex_no).toBe(1);
  });

  it("static factory returns instance", () => {
    const model = AnnexStructISO42001Model.createNewAnnexStructISO42001(data);
    expect(model).toBeInstanceOf(AnnexStructISO42001Model);
  });
});

describe("ClauseStructISO42001Model", () => {
  const data = { id: 1, title: "Context", clause_no: 4, framework_id: 3 } as ClauseStructISO42001Model;

  it("constructor copies all fields", () => {
    const model = new ClauseStructISO42001Model(data);
    expect(model.title).toBe("Context");
    expect(model.clause_no).toBe(4);
  });

  it("static factory returns instance", () => {
    const model = ClauseStructISO42001Model.createNewClauseStructISO42001(data);
    expect(model).toBeInstanceOf(ClauseStructISO42001Model);
  });
});

describe("SubClauseISO42001Model", () => {
  const data = {
    id: 1,
    implementation_description: "Implemented",
    evidence_links: [],
    status: "In progress" as const,
    owner: 1,
    reviewer: 2,
    approver: 3,
    due_date: new Date(),
    auditor_feedback: "",
    subclause_meta_id: 10,
    projects_frameworks_id: 5,
    created_at: new Date(),
    is_demo: false,
  } as SubClauseISO42001Model;

  it("constructor copies all fields", () => {
    const model = new SubClauseISO42001Model(data);
    expect(model.subclause_meta_id).toBe(10);
    expect(model.status).toBe("In progress");
  });

  it("static factory returns instance", () => {
    const model = SubClauseISO42001Model.createNewSubClauseISO42001(data);
    expect(model).toBeInstanceOf(SubClauseISO42001Model);
  });
});

describe("SubClauseISO42001RiskModel", () => {
  const data = { subclause_id: 3, projects_risks_id: 7 } as SubClauseISO42001RiskModel;

  it("constructor copies all fields", () => {
    const model = new SubClauseISO42001RiskModel(data);
    expect(model.subclause_id).toBe(3);
    expect(model.projects_risks_id).toBe(7);
  });

  it("static factory returns instance", () => {
    const model = SubClauseISO42001RiskModel.createNewSubClauseISO42001Risk(data);
    expect(model).toBeInstanceOf(SubClauseISO42001RiskModel);
  });
});

describe("SubClauseStructISO42001Model", () => {
  const data = {
    id: 1,
    title: "4.1",
    order_no: 1,
    summary: "Understanding context",
    questions: ["What factors?"],
    evidence_examples: ["Context document"],
    clause_id: 4,
  } as SubClauseStructISO42001Model;

  it("constructor copies all fields", () => {
    const model = new SubClauseStructISO42001Model(data);
    expect(model.title).toBe("4.1");
    expect(model.questions).toHaveLength(1);
  });

  it("static factory returns instance", () => {
    const model = SubClauseStructISO42001Model.createNewSubClauseStructISO42001(data);
    expect(model).toBeInstanceOf(SubClauseStructISO42001Model);
  });
});
