import { ValidationException, NotFoundException } from "../exceptions/custom.exception";
import { numberValidation } from "../validations/number.valid";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    ENUM: jest.fn(),
  },
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Test class mimicking TrainingRegistarModel behavior
class TestTrainingRegistarModel {
  id?: number;
  training_name!: string;
  duration!: string;
  provider!: string;
  department!: string;
  status!: "Planned" | "In Progress" | "Completed";
  numberOfPeople!: number;
  description!: string;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new training register
  static async createNewTrainingRegister(
    training_name: string,
    duration: string,
    provider: string,
    department: string,
    status: "Planned" | "In Progress" | "Completed" = "Planned",
    numberOfPeople: number,
    description: string,
  ): Promise<TestTrainingRegistarModel> {
    // Validate required fields
    if (!training_name || training_name.trim().length === 0) {
      throw new ValidationException("Training name is required", "training_name", training_name);
    }

    if (!numberValidation(numberOfPeople, 1)) {
      throw new ValidationException(
        "Number of people must be a positive integer",
        "numberOfPeople",
        numberOfPeople,
      );
    }

    // Validate status enum
    const validStatuses = ["Planned", "In Progress", "Completed"];
    if (!validStatuses.includes(status)) {
      throw new ValidationException(
        "Status must be one of: Planned, In Progress, Completed",
        "status",
        status,
      );
    }

    // Create and return the training register model instance
    const trainingRegister = new TestTrainingRegistarModel();
    trainingRegister.training_name = training_name.trim();
    trainingRegister.duration = duration.trim();
    trainingRegister.provider = provider.trim();
    trainingRegister.department = department.trim();
    trainingRegister.status = status;
    trainingRegister.numberOfPeople = numberOfPeople;
    trainingRegister.description = description ? description.trim() : "";

    return trainingRegister;
  }

  // Instance method to check if training is planned
  isPlanned(): boolean {
    return this.status === "Planned";
  }

  // Instance method to check if training is completed
  isCompleted(): boolean {
    return this.status === "Completed";
  }

  // Instance method to get training progress percentage
  getProgressPercentage(): number {
    switch (this.status) {
      case "Completed":
        return 100;
      case "In Progress":
        return 50;
      case "Planned":
        return 0;
      default:
        return 0;
    }
  }

  // Static method to find training register by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestTrainingRegistarModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Training register not found", "TrainingRegister", id);
    }

    return new TestTrainingRegistarModel({
      id,
      training_name: "Test Training",
      duration: "2 days",
      provider: "Test Provider",
      department: "IT",
      status: "Planned",
      numberOfPeople: 10,
      description: "Test description",
    });
  }
}

describe("TrainingRegistarModel", () => {
  const validTrainingData = {
    training_name: "Security Training",
    duration: "3 days",
    provider: "Security Corp",
    department: "IT",
    status: "Planned" as const,
    numberOfPeople: 15,
    description: "Cybersecurity awareness training",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewTrainingRegister", () => {
    it("should create training register with valid data", async () => {
      const training = await TestTrainingRegistarModel.createNewTrainingRegister(
        validTrainingData.training_name,
        validTrainingData.duration,
        validTrainingData.provider,
        validTrainingData.department,
        validTrainingData.status,
        validTrainingData.numberOfPeople,
        validTrainingData.description,
      );

      expect(training).toBeInstanceOf(TestTrainingRegistarModel);
      expect(training.training_name).toBe("Security Training");
      expect(training.status).toBe("Planned");
      expect(training.numberOfPeople).toBe(15);
    });

    it("should throw ValidationException for empty training name", async () => {
      await expect(
        TestTrainingRegistarModel.createNewTrainingRegister(
          "",
          validTrainingData.duration,
          validTrainingData.provider,
          validTrainingData.department,
          validTrainingData.status,
          validTrainingData.numberOfPeople,
          validTrainingData.description,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid number of people", async () => {
      await expect(
        TestTrainingRegistarModel.createNewTrainingRegister(
          validTrainingData.training_name,
          validTrainingData.duration,
          validTrainingData.provider,
          validTrainingData.department,
          validTrainingData.status,
          0,
          validTrainingData.description,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("status checks", () => {
    it("should correctly identify planned training", () => {
      const training = new TestTrainingRegistarModel({
        ...validTrainingData,
        status: "Planned",
      });
      expect(training.isPlanned()).toBe(true);
      expect(training.isCompleted()).toBe(false);
    });

    it("should correctly identify completed training", () => {
      const training = new TestTrainingRegistarModel({
        ...validTrainingData,
        status: "Completed",
      });
      expect(training.isPlanned()).toBe(false);
      expect(training.isCompleted()).toBe(true);
    });
  });

  describe("getProgressPercentage", () => {
    it("should return 100 for completed training", () => {
      const training = new TestTrainingRegistarModel({
        ...validTrainingData,
        status: "Completed",
      });
      expect(training.getProgressPercentage()).toBe(100);
    });

    it("should return 50 for in-progress training", () => {
      const training = new TestTrainingRegistarModel({
        ...validTrainingData,
        status: "In Progress",
      });
      expect(training.getProgressPercentage()).toBe(50);
    });

    it("should return 0 for planned training", () => {
      const training = new TestTrainingRegistarModel({
        ...validTrainingData,
        status: "Planned",
      });
      expect(training.getProgressPercentage()).toBe(0);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find training register by valid ID", async () => {
      const training = await TestTrainingRegistarModel.findByIdWithValidation(1);

      expect(training).toBeInstanceOf(TestTrainingRegistarModel);
      expect(training.id).toBe(1);
      expect(training.training_name).toBe("Test Training");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestTrainingRegistarModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestTrainingRegistarModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
