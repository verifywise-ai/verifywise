import { describe, it, expect } from "vitest";
import { AssessmentModel } from "../assessment/assessment.model";
import { ControlModel } from "../control/control.model";
import { ControlCategoryModel } from "../controlCategory/controlCategory.model";
import { ProjectScopeModel } from "../projectScope/projectScope.model";
import { QuestionModel } from "../question/question.model";
import { SubControlModel } from "../subcontrol/subControl.model";
import { SubtopicModel } from "../subtopic/subtopic.model";
import { TopicModel } from "../topic/topic.model";

describe("AssessmentModel", () => {
  const data = { id: 1, project_id: 10, is_demo: false, created_at: new Date() } as AssessmentModel;

  it("constructor copies all fields", () => {
    const model = new AssessmentModel(data);
    expect(model.id).toBe(1);
    expect(model.project_id).toBe(10);
    expect(model.is_demo).toBe(false);
  });

  it("static factory returns instance", () => {
    const model = AssessmentModel.createNewAssessment(data);
    expect(model).toBeInstanceOf(AssessmentModel);
    expect(model.project_id).toBe(10);
  });
});

describe("ControlModel", () => {
  const data = {
    id: 1,
    title: "Control A",
    description: "Description",
    status: "Waiting" as const,
    control_category_id: 5,
    order_no: 1,
  } as ControlModel;

  it("constructor copies all fields", () => {
    const model = new ControlModel(data);
    expect(model.title).toBe("Control A");
    expect(model.status).toBe("Waiting");
    expect(model.control_category_id).toBe(5);
  });

  it("static factory returns instance", () => {
    const model = ControlModel.createNewControl(data);
    expect(model).toBeInstanceOf(ControlModel);
  });
});

describe("ControlCategoryModel", () => {
  const data = { id: 1, project_id: 10, title: "Category A", order_no: 1 } as ControlCategoryModel;

  it("constructor copies all fields", () => {
    const model = new ControlCategoryModel(data);
    expect(model.title).toBe("Category A");
    expect(model.project_id).toBe(10);
  });

  it("static factory returns instance", () => {
    const model = ControlCategoryModel.createNewControlCategory(data);
    expect(model).toBeInstanceOf(ControlCategoryModel);
  });
});

describe("ProjectScopeModel", () => {
  const data = {
    id: 1,
    assessmentId: 5,
    describeAiEnvironment: "Cloud-based",
    isNewAiTechnology: true,
    usesPersonalData: false,
    projectScopeDocuments: "doc.pdf",
    technologyType: "ML",
    hasOngoingMonitoring: true,
    unintendedOutcomes: "None",
    technologyDocumentation: "docs",
  } as ProjectScopeModel;

  it("constructor copies all fields", () => {
    const model = new ProjectScopeModel(data);
    expect(model.assessmentId).toBe(5);
    expect(model.isNewAiTechnology).toBe(true);
    expect(model.usesPersonalData).toBe(false);
  });

  it("static factory returns instance", () => {
    const model = ProjectScopeModel.createNewProjectScope(data);
    expect(model).toBeInstanceOf(ProjectScopeModel);
  });
});

describe("QuestionModel", () => {
  const data = {
    id: 1,
    question: "What is the purpose?",
    hint: "Describe...",
    priority_level: "high priority" as const,
    answer_type: "text",
    input_type: "textarea",
    evidence_required: true,
    is_required: true,
    subtopic_id: 3,
    order_no: 1,
  } as QuestionModel;

  it("constructor copies all fields", () => {
    const model = new QuestionModel(data);
    expect(model.question).toBe("What is the purpose?");
    expect(model.priority_level).toBe("high priority");
    expect(model.evidence_required).toBe(true);
  });

  it("static factory returns instance", () => {
    const model = QuestionModel.createNewQuestion(data);
    expect(model).toBeInstanceOf(QuestionModel);
  });
});

describe("SubControlModel", () => {
  const data = {
    id: 1,
    title: "Sub Control",
    description: "Details",
    status: "In progress" as const,
    control_id: 10,
  } as SubControlModel;

  it("constructor copies all fields", () => {
    const model = new SubControlModel(data);
    expect(model.title).toBe("Sub Control");
    expect(model.control_id).toBe(10);
  });

  it("static factory returns instance", () => {
    const model = SubControlModel.createSubControl(data);
    expect(model).toBeInstanceOf(SubControlModel);
  });
});

describe("SubtopicModel", () => {
  const data = { id: 1, title: "Subtopic A", order_no: 1, topic_id: 5 } as SubtopicModel;

  it("constructor copies all fields", () => {
    const model = new SubtopicModel(data);
    expect(model.title).toBe("Subtopic A");
    expect(model.topic_id).toBe(5);
  });

  it("static factory returns instance", () => {
    const model = SubtopicModel.createSubtopic(data);
    expect(model).toBeInstanceOf(SubtopicModel);
  });
});

describe("TopicModel", () => {
  const data = { id: 1, title: "Topic A", order_no: 1, assessment_id: 3 } as TopicModel;

  it("constructor copies all fields", () => {
    const model = new TopicModel(data);
    expect(model.title).toBe("Topic A");
    expect(model.assessment_id).toBe(3);
  });

  it("static factory returns instance", () => {
    const model = TopicModel.createTopic(data);
    expect(model).toBeInstanceOf(TopicModel);
  });
});
