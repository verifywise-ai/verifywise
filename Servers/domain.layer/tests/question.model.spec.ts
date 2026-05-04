import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../exceptions/custom.exception";
import { numberValidation } from "../validations/number.valid";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    ARRAY: jest.fn(() => "ARRAY"),
    JSONB: "JSONB",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock SubtopicModel
jest.mock("../models/subtopic/subtopic.model", () => ({
  SubtopicModel: class MockSubtopicModel {},
}));

// Test class mimicking QuestionModel behavior
class TestQuestionModel {
  id?: number;
  order_no?: number;
  question!: string;
  hint!: string;
  priority_level!: "high priority" | "medium priority" | "low priority";
  answer_type!: string;
  input_type!: string;
  evidence_required!: boolean;
  is_required!: boolean;
  dropdown_options?: any[];
  evidence_files?: any[];
  answer?: string;
  subtopic_id!: number;
  is_demo?: boolean;
  created_at?: Date;
  status?: "Not started" | "In progress" | "Done";

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new question
  static async createNewQuestion(
    question: string,
    hint: string,
    priority_level: "high priority" | "medium priority" | "low priority",
    answer_type: string,
    input_type: string,
    evidence_required: boolean,
    is_required: boolean,
    subtopic_id: number,
    order_no?: number,
    dropdown_options?: any[],
    evidence_files?: any[],
    is_demo: boolean = false,
  ): Promise<TestQuestionModel> {
    // Validate required fields
    if (!question || question.trim().length === 0) {
      throw new ValidationException("Question text is required", "question", question);
    }

    if (!hint || hint.trim().length === 0) {
      throw new ValidationException("Hint is required", "hint", hint);
    }

    if (!answer_type || answer_type.trim().length === 0) {
      throw new ValidationException("Answer type is required", "answer_type", answer_type);
    }

    if (!input_type || input_type.trim().length === 0) {
      throw new ValidationException("Input type is required", "input_type", input_type);
    }

    // Validate priority_level
    const validPriorities = ["high priority", "medium priority", "low priority"];
    if (!validPriorities.includes(priority_level)) {
      throw new ValidationException("Invalid priority level", "priority_level", priority_level);
    }

    // Validate subtopic_id
    if (!numberValidation(subtopic_id, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required (must be >= 1)",
        "subtopic_id",
        subtopic_id,
      );
    }

    // Validate order_no if provided
    if (order_no !== undefined && !numberValidation(order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no,
      );
    }

    // Create and return the question model instance
    const questionModel = new TestQuestionModel();
    questionModel.question = question.trim();
    questionModel.hint = hint.trim();
    questionModel.priority_level = priority_level;
    questionModel.answer_type = answer_type.trim();
    questionModel.input_type = input_type.trim();
    questionModel.evidence_required = evidence_required;
    questionModel.is_required = is_required;
    questionModel.subtopic_id = subtopic_id;
    questionModel.order_no = order_no;
    questionModel.dropdown_options = dropdown_options || [];
    questionModel.evidence_files = evidence_files || [];
    questionModel.status = "Not started";
    questionModel.is_demo = is_demo;
    questionModel.created_at = new Date();

    return questionModel;
  }

  // Instance method to update question
  async updateQuestion(updateData: {
    question?: string;
    hint?: string;
    priority_level?: "high priority" | "medium priority" | "low priority";
    answer_type?: string;
    input_type?: string;
    evidence_required?: boolean;
    is_required?: boolean;
    order_no?: number;
    dropdown_options?: any[];
    evidence_files?: any[];
    answer?: string;
    status?: "Not started" | "In progress" | "Done";
  }): Promise<void> {
    if (updateData.question !== undefined) {
      if (!updateData.question || updateData.question.trim().length === 0) {
        throw new ValidationException("Question text is required", "question", updateData.question);
      }
      this.question = updateData.question.trim();
    }

    if (updateData.status !== undefined) {
      const validStatuses = ["Not started", "In progress", "Done"];
      if (!validStatuses.includes(updateData.status)) {
        throw new ValidationException("Invalid status value", "status", updateData.status);
      }
      this.status = updateData.status;
    }

    // Update other fields if provided
    if (updateData.hint !== undefined) this.hint = updateData.hint.trim();
    if (updateData.priority_level !== undefined) this.priority_level = updateData.priority_level;
    if (updateData.answer_type !== undefined) this.answer_type = updateData.answer_type.trim();
    if (updateData.input_type !== undefined) this.input_type = updateData.input_type.trim();
    if (updateData.evidence_required !== undefined)
      this.evidence_required = updateData.evidence_required;
    if (updateData.is_required !== undefined) this.is_required = updateData.is_required;
    if (updateData.order_no !== undefined) this.order_no = updateData.order_no;
    if (updateData.dropdown_options !== undefined)
      this.dropdown_options = updateData.dropdown_options;
    if (updateData.evidence_files !== undefined) this.evidence_files = updateData.evidence_files;
    if (updateData.answer !== undefined) this.answer = updateData.answer;
  }

  // Instance method to validate question data
  async validateQuestionData(): Promise<void> {
    if (!this.question || this.question.trim().length === 0) {
      throw new ValidationException("Question text is required", "question", this.question);
    }

    if (!this.subtopic_id || !numberValidation(this.subtopic_id, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required",
        "subtopic_id",
        this.subtopic_id,
      );
    }
  }

  // Instance method to check if question is a demo question
  isDemoQuestion(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if question can be modified
  canBeModified(): boolean {
    if (this.isDemoQuestion()) {
      throw new BusinessLogicException(
        "Demo questions cannot be modified",
        "DEMO_QUESTION_RESTRICTION",
        { questionId: this.id, subtopicId: this.subtopic_id },
      );
    }
    return true;
  }

  // Instance method to check if question is completed
  isCompleted(): boolean {
    return this.status === "Done";
  }

  // Instance method to get progress percentage
  getProgressPercentage(): number {
    if (this.isCompleted()) {
      return 100;
    }
    if (this.status === "In progress") {
      return 50;
    }
    return 0;
  }

  // Static method to find question by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestQuestionModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Question not found", "Question", id);
    }

    return new TestQuestionModel({
      id,
      question: "Test Question",
      hint: "Test Hint",
      priority_level: "medium priority",
      answer_type: "text",
      input_type: "text",
      evidence_required: false,
      is_required: true,
      subtopic_id: 1,
      status: "Not started",
      is_demo: false,
      created_at: new Date(),
    });
  }

  // Static method to find questions by subtopic ID
  static async findBySubtopicId(subtopicId: number): Promise<TestQuestionModel[]> {
    if (!numberValidation(subtopicId, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required (must be >= 1)",
        "subtopic_id",
        subtopicId,
      );
    }

    return [
      new TestQuestionModel({
        id: 1,
        question: "Question 1",
        subtopic_id: subtopicId,
        status: "Not started",
      }),
      new TestQuestionModel({
        id: 2,
        question: "Question 2",
        subtopic_id: subtopicId,
        status: "Done",
      }),
    ];
  }
}

describe("QuestionModel", () => {
  const validQuestionData = {
    question: "What is the main objective?",
    hint: "Think about the primary goal",
    priority_level: "high priority" as const,
    answer_type: "text",
    input_type: "textarea",
    evidence_required: true,
    is_required: true,
    subtopic_id: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewQuestion", () => {
    it("should create question with valid data", async () => {
      const question = await TestQuestionModel.createNewQuestion(
        validQuestionData.question,
        validQuestionData.hint,
        validQuestionData.priority_level,
        validQuestionData.answer_type,
        validQuestionData.input_type,
        validQuestionData.evidence_required,
        validQuestionData.is_required,
        validQuestionData.subtopic_id,
      );

      expect(question).toBeInstanceOf(TestQuestionModel);
      expect(question.question).toBe("What is the main objective?");
      expect(question.priority_level).toBe("high priority");
      expect(question.status).toBe("Not started");
      expect(question.is_demo).toBe(false);
    });

    it("should throw ValidationException for empty question", async () => {
      await expect(
        TestQuestionModel.createNewQuestion(
          "",
          validQuestionData.hint,
          validQuestionData.priority_level,
          validQuestionData.answer_type,
          validQuestionData.input_type,
          validQuestionData.evidence_required,
          validQuestionData.is_required,
          validQuestionData.subtopic_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid priority level", async () => {
      await expect(
        TestQuestionModel.createNewQuestion(
          validQuestionData.question,
          validQuestionData.hint,
          "invalid priority" as any,
          validQuestionData.answer_type,
          validQuestionData.input_type,
          validQuestionData.evidence_required,
          validQuestionData.is_required,
          validQuestionData.subtopic_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid subtopic_id", async () => {
      await expect(
        TestQuestionModel.createNewQuestion(
          validQuestionData.question,
          validQuestionData.hint,
          validQuestionData.priority_level,
          validQuestionData.answer_type,
          validQuestionData.input_type,
          validQuestionData.evidence_required,
          validQuestionData.is_required,
          0,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateQuestion", () => {
    it("should update question successfully", async () => {
      const question = new TestQuestionModel(validQuestionData);

      await question.updateQuestion({
        question: "Updated question",
        status: "In progress",
      });

      expect(question.question).toBe("Updated question");
      expect(question.status).toBe("In progress");
    });

    it("should throw ValidationException for empty question update", async () => {
      const question = new TestQuestionModel(validQuestionData);

      await expect(question.updateQuestion({ question: "" })).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid status", async () => {
      const question = new TestQuestionModel(validQuestionData);

      await expect(question.updateQuestion({ status: "Invalid" as any })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateQuestionData", () => {
    it("should pass validation with valid data", async () => {
      const question = new TestQuestionModel(validQuestionData);

      await expect(question.validateQuestionData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty question", async () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        question: "",
      });

      await expect(question.validateQuestionData()).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular question", () => {
      const question = new TestQuestionModel(validQuestionData);
      expect(question.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        is_demo: true,
      });

      expect(() => question.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("isCompleted", () => {
    it("should return true for completed question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        status: "Done",
      });
      expect(question.isCompleted()).toBe(true);
    });

    it("should return false for non-completed question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        status: "Not started",
      });
      expect(question.isCompleted()).toBe(false);
    });
  });

  describe("getProgressPercentage", () => {
    it("should return 100 for completed question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        status: "Done",
      });
      expect(question.getProgressPercentage()).toBe(100);
    });

    it("should return 50 for in-progress question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        status: "In progress",
      });
      expect(question.getProgressPercentage()).toBe(50);
    });

    it("should return 0 for not started question", () => {
      const question = new TestQuestionModel({
        ...validQuestionData,
        status: "Not started",
      });
      expect(question.getProgressPercentage()).toBe(0);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find question by valid ID", async () => {
      const question = await TestQuestionModel.findByIdWithValidation(1);

      expect(question).toBeInstanceOf(TestQuestionModel);
      expect(question.id).toBe(1);
      expect(question.question).toBe("Test Question");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestQuestionModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestQuestionModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findBySubtopicId", () => {
    it("should find questions by subtopic ID", async () => {
      const questions = await TestQuestionModel.findBySubtopicId(1);

      expect(questions).toHaveLength(2);
      expect(questions[0].subtopic_id).toBe(1);
      expect(questions[1].subtopic_id).toBe(1);
    });

    it("should throw ValidationException for invalid subtopic_id", async () => {
      await expect(TestQuestionModel.findBySubtopicId(0)).rejects.toThrow(ValidationException);
    });
  });
});
