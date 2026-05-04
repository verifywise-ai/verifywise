import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ITrainingRegister } from "../../interfaces/i.trainingRegister";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException, NotFoundException } from "../../exceptions/custom.exception";

@Table({
  tableName: "trainingregistar",
  timestamps: true,
  underscored: true,
})
export class TrainingRegistarModel
  extends Model<TrainingRegistarModel>
  implements ITrainingRegister
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  training_name!: string;

  @Column({
    type: DataType.STRING,
  })
  duration!: string;

  @Column({
    type: DataType.STRING,
  })
  provider!: string;

  @Column({
    type: DataType.STRING,
  })
  department!: string;

  @Column({
    type: DataType.ENUM("Planned", "In Progress", "Completed"),
  })
  status!: "Planned" | "In Progress" | "Completed";

  @Column({
    type: DataType.INTEGER,
    field: "people",
  })
  numberOfPeople!: number;

  @Column({
    type: DataType.STRING,
  })
  description!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  /**
   * Create a new training register with comprehensive validation
   */
  static async createNewTrainingRegister(
    training_name: string,
    duration: string,
    provider: string,
    department: string,
    status: "Planned" | "In Progress" | "Completed" = "Planned",
    numberOfPeople: number,
    description: string,
  ): Promise<TrainingRegistarModel> {
    // Validate required fields
    if (!training_name || training_name.trim().length === 0) {
      throw new ValidationException("Training name is required", "training_name", training_name);
    }

    if (!duration || duration.trim().length === 0) {
      throw new ValidationException("Duration is required", "duration", duration);
    }

    if (!provider || provider.trim().length === 0) {
      throw new ValidationException("Provider is required", "provider", provider);
    }

    if (!department || department.trim().length === 0) {
      throw new ValidationException("Department is required", "department", department);
    }

    if (!numberValidation(numberOfPeople, 1)) {
      throw new ValidationException(
        "Number of people must be a positive integer",
        "numberOfPeople",
        numberOfPeople,
      );
    }

    // Description is optional, so no validation needed

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
    const trainingRegister = new TrainingRegistarModel();
    trainingRegister.training_name = training_name.trim();
    trainingRegister.duration = duration.trim();
    trainingRegister.provider = provider.trim();
    trainingRegister.department = department.trim();
    trainingRegister.status = status;
    trainingRegister.numberOfPeople = numberOfPeople;
    trainingRegister.description = description ? description.trim() : "";

    return trainingRegister;
  }

  /**
   * Update training register information with validation
   */
  async updateTrainingRegister(updateData: {
    training_name?: string;
    duration?: string;
    provider?: string;
    department?: string;
    status?: "Planned" | "In Progress" | "Completed";
    numberOfPeople?: number;
    description?: string;
  }): Promise<void> {
    // Validate training_name if provided
    if (updateData.training_name !== undefined) {
      if (!updateData.training_name || updateData.training_name.trim().length === 0) {
        throw new ValidationException(
          "Training name is required",
          "training_name",
          updateData.training_name,
        );
      }
      this.training_name = updateData.training_name.trim();
    }

    // Validate duration if provided
    if (updateData.duration !== undefined) {
      if (!updateData.duration || updateData.duration.trim().length === 0) {
        throw new ValidationException("Duration is required", "duration", updateData.duration);
      }
      this.duration = updateData.duration.trim();
    }

    // Validate provider if provided
    if (updateData.provider !== undefined) {
      if (!updateData.provider || updateData.provider.trim().length === 0) {
        throw new ValidationException("Provider is required", "provider", updateData.provider);
      }
      this.provider = updateData.provider.trim();
    }

    // Validate department if provided
    if (updateData.department !== undefined) {
      if (!updateData.department || updateData.department.trim().length === 0) {
        throw new ValidationException(
          "Department is required",
          "department",
          updateData.department,
        );
      }
      this.department = updateData.department.trim();
    }

    // Validate status if provided
    if (updateData.status !== undefined) {
      const validStatuses = ["Planned", "In Progress", "Completed"];
      if (!validStatuses.includes(updateData.status)) {
        throw new ValidationException(
          "Status must be one of: Planned, In Progress, Completed",
          "status",
          updateData.status,
        );
      }
      this.status = updateData.status;
    }

    // Validate numberOfPeople if provided
    if (updateData.numberOfPeople !== undefined) {
      if (!numberValidation(updateData.numberOfPeople, 1)) {
        throw new ValidationException(
          "Number of people must be a positive integer",
          "numberOfPeople",
          updateData.numberOfPeople,
        );
      }
      this.numberOfPeople = updateData.numberOfPeople;
    }

    // Validate description if provided (optional field)
    if (updateData.description !== undefined) {
      this.description = updateData.description.trim();
    }
  }

  /**
   * Validate training register data before saving
   */
  async validateTrainingRegisterData(): Promise<void> {
    if (!this.training_name || this.training_name.trim().length === 0) {
      throw new ValidationException(
        "Training name is required",
        "training_name",
        this.training_name,
      );
    }

    if (!this.duration || this.duration.trim().length === 0) {
      throw new ValidationException("Duration is required", "duration", this.duration);
    }

    if (!this.provider || this.provider.trim().length === 0) {
      throw new ValidationException("Provider is required", "provider", this.provider);
    }

    if (!this.department || this.department.trim().length === 0) {
      throw new ValidationException("Department is required", "department", this.department);
    }

    if (!this.numberOfPeople || !numberValidation(this.numberOfPeople, 1)) {
      throw new ValidationException(
        "Valid number of people is required",
        "numberOfPeople",
        this.numberOfPeople,
      );
    }

    // Description is optional, so no validation needed

    const validStatuses = ["Planned", "In Progress", "Completed"];
    if (!validStatuses.includes(this.status)) {
      throw new ValidationException("Valid status is required", "status", this.status);
    }
  }

  /**
   * Check if training is planned
   */
  isPlanned(): boolean {
    return this.status === "Planned";
  }

  /**
   * Check if training is in progress
   */
  isInProgress(): boolean {
    return this.status === "In Progress";
  }

  /**
   * Check if training is completed
   */
  isCompleted(): boolean {
    return this.status === "Completed";
  }

  /**
   * Get training progress percentage
   */
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

  /**
   * Get training register summary for display
   */
  getSummary(): {
    id: number | undefined;
    trainingName: string;
    status: string;
    progress: number;
    provider: string;
    department: string;
    people: number;
  } {
    return {
      id: this.id,
      trainingName: this.training_name,
      status: this.status,
      progress: this.getProgressPercentage(),
      provider: this.provider,
      department: this.department,
      people: this.numberOfPeople,
    };
  }

  /**
   * Convert training register model to JSON representation
   * ARCHITECTURE: Returns 'numberOfPeople' to match API contract with frontend
   */
  toJSON(): any {
    return {
      id: this.id,
      training_name: this.training_name,
      duration: String(this.duration || ""),
      provider: this.provider,
      department: this.department,
      status: this.status,
      numberOfPeople: this.numberOfPeople,
      description: this.description,
      progressPercentage: this.getProgressPercentage(),
      createdAt: this.getDataValue("createdAt"),
      updatedAt: this.getDataValue("updatedAt"),
    };
  }

  /**
   * Create TrainingRegistarModel instance from JSON data
   */
  static fromJSON(json: any): TrainingRegistarModel {
    return new TrainingRegistarModel(json);
  }

  /**
   * Static method to find training register by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<TrainingRegistarModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const trainingRegister = await TrainingRegistarModel.findByPk(id);
    if (!trainingRegister) {
      throw new NotFoundException("Training register not found", "TrainingRegister", id);
    }

    return trainingRegister;
  }

  /**
   * Static method to find training registers by status
   */
  static async findByStatus(
    status: "Planned" | "In Progress" | "Completed",
  ): Promise<TrainingRegistarModel[]> {
    const validStatuses = ["Planned", "In Progress", "Completed"];
    if (!validStatuses.includes(status)) {
      throw new ValidationException("Valid status is required", "status", status);
    }

    return await TrainingRegistarModel.findAll({
      where: { status },
      order: [["training_name", "ASC"]],
    });
  }

  /**
   * Static method to find training registers by department
   */
  static async findByDepartment(department: string): Promise<TrainingRegistarModel[]> {
    if (!department || department.trim().length === 0) {
      throw new ValidationException("Department is required", "department", department);
    }

    return await TrainingRegistarModel.findAll({
      where: { department: department.trim() },
      order: [["training_name", "ASC"]],
    });
  }

  /**
   * Static method to update training register by ID
   */
  static async updateTrainingRegisterById(
    id: number,
    updateData: Partial<ITrainingRegister>,
  ): Promise<[number, TrainingRegistarModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await TrainingRegistarModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete training register by ID
   */
  static async deleteTrainingRegisterById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await TrainingRegistarModel.destroy({
      where: { id },
    });
  }

  constructor(init?: Partial<ITrainingRegister>) {
    super();
    Object.assign(this, init);
  }
}
