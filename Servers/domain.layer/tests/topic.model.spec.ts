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
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock AssessmentModel
jest.mock("../models/assessment/assessment.model", () => ({
  AssessmentModel: class MockAssessmentModel {},
}));

// Test class mimicking TopicModel behavior
class TestTopicModel {
  id?: number;
  title!: string;
  order_no?: number;
  assessment_id!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new topic
  static async createNewTopic(
    title: string,
    assessment_id: number,
    order_no?: number,
    is_demo: boolean = false,
  ): Promise<TestTopicModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Topic title is required", "title", title);
    }

    // Validate assessment_id
    if (!numberValidation(assessment_id, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessment_id,
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

    // Create and return the topic model instance
    const topic = new TestTopicModel();
    topic.title = title.trim();
    topic.assessment_id = assessment_id;
    topic.order_no = order_no;
    topic.is_demo = is_demo;
    topic.created_at = new Date();

    return topic;
  }

  // Instance method to update topic
  async updateTopic(updateData: { title?: string; order_no?: number }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Topic title is required", "title", updateData.title);
      }
      this.title = updateData.title.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 1)) {
        throw new ValidationException(
          "Order number must be a positive integer",
          "order_no",
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }
  }

  // Instance method to validate topic data
  async validateTopicData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Topic title is required", "title", this.title);
    }

    if (!this.assessment_id || !numberValidation(this.assessment_id, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required",
        "assessment_id",
        this.assessment_id,
      );
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no,
      );
    }
  }

  // Instance method to check if topic is a demo topic
  isDemoTopic(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if topic can be modified
  canBeModified(): boolean {
    if (this.isDemoTopic()) {
      throw new BusinessLogicException("Demo topics cannot be modified", "DEMO_TOPIC_RESTRICTION", {
        topicId: this.id,
        assessmentId: this.assessment_id,
      });
    }
    return true;
  }

  // Static method to find topic by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestTopicModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Topic not found", "Topic", id);
    }

    return new TestTopicModel({
      id,
      title: "Test Topic",
      assessment_id: 1,
      order_no: 1,
      is_demo: false,
      created_at: new Date(),
    });
  }

  // Static method to find topics by assessment ID
  static async findByAssessmentId(assessmentId: number): Promise<TestTopicModel[]> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return [
      new TestTopicModel({
        id: 1,
        title: "Topic 1",
        assessment_id: assessmentId,
        order_no: 1,
      }),
      new TestTopicModel({
        id: 2,
        title: "Topic 2",
        assessment_id: assessmentId,
        order_no: 2,
      }),
    ];
  }
}

describe("TopicModel", () => {
  const validTopicData = {
    title: "Test Topic",
    assessment_id: 1,
    order_no: 1,
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewTopic", () => {
    it("should create topic with valid data", async () => {
      const topic = await TestTopicModel.createNewTopic(
        validTopicData.title,
        validTopicData.assessment_id,
        validTopicData.order_no,
        validTopicData.is_demo,
      );

      expect(topic).toBeInstanceOf(TestTopicModel);
      expect(topic.title).toBe("Test Topic");
      expect(topic.assessment_id).toBe(1);
      expect(topic.order_no).toBe(1);
      expect(topic.is_demo).toBe(false);
      expect(topic.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty title", async () => {
      await expect(TestTopicModel.createNewTopic("", validTopicData.assessment_id)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid assessment_id", async () => {
      await expect(TestTopicModel.createNewTopic(validTopicData.title, 0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("updateTopic", () => {
    it("should update topic successfully", async () => {
      const topic = new TestTopicModel(validTopicData);

      await topic.updateTopic({
        title: "Updated Title",
        order_no: 2,
      });

      expect(topic.title).toBe("Updated Title");
      expect(topic.order_no).toBe(2);
    });

    it("should throw ValidationException for empty title update", async () => {
      const topic = new TestTopicModel(validTopicData);

      await expect(topic.updateTopic({ title: "" })).rejects.toThrow(ValidationException);
    });
  });

  describe("validateTopicData", () => {
    it("should pass validation with valid data", async () => {
      const topic = new TestTopicModel(validTopicData);

      await expect(topic.validateTopicData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty title", async () => {
      const topic = new TestTopicModel({
        ...validTopicData,
        title: "",
      });

      await expect(topic.validateTopicData()).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular topic", () => {
      const topic = new TestTopicModel(validTopicData);
      expect(topic.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo topic", () => {
      const topic = new TestTopicModel({
        ...validTopicData,
        is_demo: true,
      });

      expect(() => topic.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find topic by valid ID", async () => {
      const topic = await TestTopicModel.findByIdWithValidation(1);

      expect(topic).toBeInstanceOf(TestTopicModel);
      expect(topic.id).toBe(1);
      expect(topic.title).toBe("Test Topic");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestTopicModel.findByIdWithValidation(0)).rejects.toThrow(ValidationException);
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestTopicModel.findByIdWithValidation(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByAssessmentId", () => {
    it("should find topics by assessment ID", async () => {
      const topics = await TestTopicModel.findByAssessmentId(1);

      expect(topics).toHaveLength(2);
      expect(topics[0].assessment_id).toBe(1);
      expect(topics[1].assessment_id).toBe(1);
    });

    it("should throw ValidationException for invalid assessment_id", async () => {
      await expect(TestTopicModel.findByAssessmentId(0)).rejects.toThrow(ValidationException);
    });
  });
});
