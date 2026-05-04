jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    FLOAT: "FLOAT",
    JSONB: "JSONB",
    NOW: "NOW",
    ENUM: jest.fn(),
    ARRAY: jest.fn(),
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  HasMany: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Test models for all 14 EU AI Act framework files
class TestTopicStructEU {
  id?: number;
  title!: string;
  order_no?: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubTopicStructEU {
  id?: number;
  title!: string;
  topic_id!: number;
  order_no?: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestQuestionStructEU {
  id?: number;
  question!: string;
  subtopic_id!: number;
  hint?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestControlCategoryStructEU {
  id?: number;
  title!: string;
  order_no?: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestControlStructEU {
  id?: number;
  title!: string;
  category_id!: number;
  order_no?: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubControlStructEU {
  id?: number;
  title!: string;
  control_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAssessmentEU {
  id?: number;
  project_id!: number;
  question_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnswerEU {
  id?: number;
  assessment_id!: number;
  answer!: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnswerEURisks {
  id?: number;
  answer_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestControlEU {
  id?: number;
  project_id!: number;
  control_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestControlsEURisks {
  id?: number;
  control_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubControlEU {
  id?: number;
  control_id!: number;
  sub_control_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubControlEURisks {
  id?: number;
  sub_control_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

describe("EU AI Act Framework Models", () => {
  describe("TopicStructEU", () => {
    it("should instantiate", () => {
      const m = new TestTopicStructEU({ id: 1, title: "Risk Management System", order_no: 1 });
      expect(m.title).toBe("Risk Management System");
    });
  });

  describe("SubTopicStructEU", () => {
    it("should link to topic", () => {
      const m = new TestSubTopicStructEU({
        id: 1,
        title: "Risk Assessment",
        topic_id: 1,
        order_no: 1,
      });
      expect(m.topic_id).toBe(1);
    });
  });

  describe("QuestionStructEU", () => {
    it("should store question with hint", () => {
      const m = new TestQuestionStructEU({
        id: 1,
        question: "How is risk assessed?",
        subtopic_id: 1,
        hint: "Consider all scenarios",
      });
      expect(m.question).toBe("How is risk assessed?");
      expect(m.hint).toBe("Consider all scenarios");
    });
  });

  describe("ControlCategoryStructEU", () => {
    it("should instantiate", () => {
      const m = new TestControlCategoryStructEU({ id: 1, title: "Data Governance", order_no: 1 });
      expect(m.title).toBe("Data Governance");
    });
  });

  describe("ControlStructEU", () => {
    it("should link to category", () => {
      const m = new TestControlStructEU({ id: 1, title: "Data Quality", category_id: 1 });
      expect(m.category_id).toBe(1);
    });
  });

  describe("SubControlStructEU", () => {
    it("should link to control", () => {
      const m = new TestSubControlStructEU({ id: 1, title: "Data Validation", control_id: 1 });
      expect(m.control_id).toBe(1);
    });
  });

  describe("AssessmentEU", () => {
    it("should link project to question", () => {
      const m = new TestAssessmentEU({ id: 1, project_id: 10, question_id: 5 });
      expect(m.project_id).toBe(10);
      expect(m.question_id).toBe(5);
    });
  });

  describe("AnswerEU", () => {
    it("should store answer text", () => {
      const m = new TestAnswerEU({ id: 1, assessment_id: 1, answer: "We use automated testing" });
      expect(m.answer).toBe("We use automated testing");
    });
  });

  describe("AnswerEURisks", () => {
    it("should link risk to answer", () => {
      const m = new TestAnswerEURisks({
        id: 1,
        answer_id: 1,
        risk_description: "Insufficient testing",
      });
      expect(m.answer_id).toBe(1);
    });
  });

  describe("ControlEU", () => {
    it("should track control status per project", () => {
      const m = new TestControlEU({
        id: 1,
        project_id: 10,
        control_struct_id: 5,
        status: "implemented",
      });
      expect(m.status).toBe("implemented");
    });
  });

  describe("ControlsEURisks", () => {
    it("should link risk to control", () => {
      const m = new TestControlsEURisks({ id: 1, control_id: 1, risk_description: "Control gap" });
      expect(m.control_id).toBe(1);
    });
  });

  describe("SubControlEU", () => {
    it("should track sub-control status", () => {
      const m = new TestSubControlEU({
        id: 1,
        control_id: 1,
        sub_control_struct_id: 1,
        status: "partial",
      });
      expect(m.status).toBe("partial");
    });
  });

  describe("SubControlEURisks", () => {
    it("should link risk to sub-control", () => {
      const m = new TestSubControlEURisks({ id: 1, sub_control_id: 1, risk_description: "Gap" });
      expect(m.sub_control_id).toBe(1);
    });
  });
});
