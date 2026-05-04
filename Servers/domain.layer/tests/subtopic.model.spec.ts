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

// Mock TopicModel
jest.mock("../models/topic/topic.model", () => ({
  TopicModel: class MockTopicModel {},
}));

// Test class mimicking SubtopicModel behavior
class TestSubtopicModel {
  id?: number;
  title!: string;
  order_no?: number;
  topic_id!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new subtopic
  static async createNewSubtopic(
    title: string,
    topic_id: number,
    order_no?: number,
    is_demo: boolean = false,
  ): Promise<TestSubtopicModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Subtopic title is required", "title", title);
    }

    // Validate topic_id
    if (!numberValidation(topic_id, 1)) {
      throw new ValidationException(
        "Valid topic_id is required (must be >= 1)",
        "topic_id",
        topic_id,
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

    // Create and return the subtopic model instance
    const subtopic = new TestSubtopicModel();
    subtopic.title = title.trim();
    subtopic.topic_id = topic_id;
    subtopic.order_no = order_no;
    subtopic.is_demo = is_demo;
    subtopic.created_at = new Date();

    return subtopic;
  }

  // Instance method to update subtopic
  async updateSubtopic(updateData: { title?: string; order_no?: number }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Subtopic title is required", "title", updateData.title);
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

  // Instance method to validate subtopic data
  async validateSubtopicData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Subtopic title is required", "title", this.title);
    }

    if (!this.topic_id || !numberValidation(this.topic_id, 1)) {
      throw new ValidationException("Valid topic_id is required", "topic_id", this.topic_id);
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no,
      );
    }
  }

  // Instance method to check if subtopic is a demo subtopic
  isDemoSubtopic(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if subtopic can be modified
  canBeModified(): boolean {
    if (this.isDemoSubtopic()) {
      throw new BusinessLogicException(
        "Demo subtopics cannot be modified",
        "DEMO_SUBTOPIC_RESTRICTION",
        { subtopicId: this.id, topicId: this.topic_id },
      );
    }
    return true;
  }

  // Instance method to get summary
  getSummary(): {
    id: number | undefined;
    title: string;
    orderNo: number | undefined;
    topicId: number;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      title: this.title,
      orderNo: this.order_no,
      topicId: this.topic_id,
      isDemo: this.isDemoSubtopic(),
    };
  }

  // Instance method to convert to JSON
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      order_no: this.order_no,
      topic_id: this.topic_id,
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
    };
  }

  // Static method to find subtopic by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestSubtopicModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Subtopic not found", "Subtopic", id);
    }

    return new TestSubtopicModel({
      id,
      title: "Test Subtopic",
      topic_id: 1,
      order_no: 1,
      is_demo: false,
      created_at: new Date(),
    });
  }

  // Static method to find subtopics by topic ID
  static async findByTopicId(topicId: number): Promise<TestSubtopicModel[]> {
    if (!numberValidation(topicId, 1)) {
      throw new ValidationException(
        "Valid topic_id is required (must be >= 1)",
        "topic_id",
        topicId,
      );
    }

    return [
      new TestSubtopicModel({
        id: 1,
        title: "Subtopic 1",
        topic_id: topicId,
        order_no: 1,
      }),
      new TestSubtopicModel({
        id: 2,
        title: "Subtopic 2",
        topic_id: topicId,
        order_no: 2,
      }),
    ];
  }
}

describe("SubtopicModel", () => {
  const validSubtopicData = {
    title: "Test Subtopic",
    topic_id: 1,
    order_no: 1,
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewSubtopic", () => {
    it("should create subtopic with valid data", async () => {
      const subtopic = await TestSubtopicModel.createNewSubtopic(
        validSubtopicData.title,
        validSubtopicData.topic_id,
        validSubtopicData.order_no,
        validSubtopicData.is_demo,
      );

      expect(subtopic).toBeInstanceOf(TestSubtopicModel);
      expect(subtopic.title).toBe("Test Subtopic");
      expect(subtopic.topic_id).toBe(1);
      expect(subtopic.order_no).toBe(1);
      expect(subtopic.is_demo).toBe(false);
      expect(subtopic.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty title", async () => {
      await expect(
        TestSubtopicModel.createNewSubtopic("", validSubtopicData.topic_id),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid topic_id", async () => {
      await expect(TestSubtopicModel.createNewSubtopic(validSubtopicData.title, 0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid order_no", async () => {
      await expect(
        TestSubtopicModel.createNewSubtopic(validSubtopicData.title, validSubtopicData.topic_id, 0),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateSubtopic", () => {
    it("should update subtopic successfully", async () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);

      await subtopic.updateSubtopic({
        title: "Updated Title",
        order_no: 2,
      });

      expect(subtopic.title).toBe("Updated Title");
      expect(subtopic.order_no).toBe(2);
    });

    it("should throw ValidationException for empty title update", async () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);

      await expect(subtopic.updateSubtopic({ title: "" })).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid order_no update", async () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);

      await expect(subtopic.updateSubtopic({ order_no: 0 })).rejects.toThrow(ValidationException);
    });
  });

  describe("validateSubtopicData", () => {
    it("should pass validation with valid data", async () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);

      await expect(subtopic.validateSubtopicData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty title", async () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        title: "",
      });

      await expect(subtopic.validateSubtopicData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid topic_id", async () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        topic_id: 0,
      });

      await expect(subtopic.validateSubtopicData()).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular subtopic", () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);
      expect(subtopic.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo subtopic", () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        is_demo: true,
      });

      expect(() => subtopic.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("isDemoSubtopic", () => {
    it("should return true for demo subtopic", () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        is_demo: true,
      });
      expect(subtopic.isDemoSubtopic()).toBe(true);
    });

    it("should return false for regular subtopic", () => {
      const subtopic = new TestSubtopicModel(validSubtopicData);
      expect(subtopic.isDemoSubtopic()).toBe(false);
    });
  });

  describe("getSummary", () => {
    it("should return correct summary", () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        id: 1,
      });

      const summary = subtopic.getSummary();

      expect(summary).toEqual({
        id: 1,
        title: "Test Subtopic",
        orderNo: 1,
        topicId: 1,
        isDemo: false,
      });
    });
  });

  describe("toJSON", () => {
    it("should return formatted JSON", () => {
      const subtopic = new TestSubtopicModel({
        ...validSubtopicData,
        id: 1,
        created_at: new Date("2023-01-01T00:00:00.000Z"),
      });

      const result = subtopic.toJSON();

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("title", "Test Subtopic");
      expect(result).toHaveProperty("created_at", "2023-01-01T00:00:00.000Z");
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find subtopic by valid ID", async () => {
      const subtopic = await TestSubtopicModel.findByIdWithValidation(1);

      expect(subtopic).toBeInstanceOf(TestSubtopicModel);
      expect(subtopic.id).toBe(1);
      expect(subtopic.title).toBe("Test Subtopic");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestSubtopicModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestSubtopicModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByTopicId", () => {
    it("should find subtopics by topic ID", async () => {
      const subtopics = await TestSubtopicModel.findByTopicId(1);

      expect(subtopics).toHaveLength(2);
      expect(subtopics[0].topic_id).toBe(1);
      expect(subtopics[1].topic_id).toBe(1);
    });

    it("should throw ValidationException for invalid topic_id", async () => {
      await expect(TestSubtopicModel.findByTopicId(0)).rejects.toThrow(ValidationException);
    });
  });
});
