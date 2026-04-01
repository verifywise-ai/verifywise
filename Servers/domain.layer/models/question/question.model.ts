import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { SubtopicModel } from "../subtopic/subtopic.model";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";
import { IQuestion } from "../../interfaces/I.question";

@Table({
  tableName: "questions",
  timestamps: true,
  underscored: true,
})
export class QuestionModel extends Model<QuestionModel> implements IQuestion {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.STRING,
  })
  question!: string;

  @Column({
    type: DataType.STRING,
  })
  hint!: string;

  @Column({
    type: DataType.ENUM("high priority", "medium priority", "low priority"),
  })
  priority_level!: "high priority" | "medium priority" | "low priority";

  @Column({
    type: DataType.STRING,
  })
  answer_type!: string;

  @Column({
    type: DataType.STRING,
  })
  input_type!: string;

  @Column({
    type: DataType.BOOLEAN,
  })
  evidence_required!: boolean;

  @Column({
    type: DataType.BOOLEAN,
  })
  is_required!: boolean;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
  })
  dropdown_options?: any[];

  /**
   * Evidence files - now managed via file_entity_links table
   * This property is populated dynamically by the utils layer, not stored in database
   */
  evidence_files?: {
    id: string | number;
    fileName?: string;
    filename?: string;
    project_id?: number;
    uploaded_by?: number;
    uploaded_time?: Date;
  }[];

  @Column({
    type: DataType.STRING,
  })
  answer?: string;

  @ForeignKey(() => SubtopicModel)
  @Column({
    type: DataType.INTEGER,
  })
  subtopic_id!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

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

  @Column({
    type: DataType.ENUM("Not started", "In progress", "Done"),
  })
  status?: "Not started" | "In progress" | "Done";

  /**
   * Create a new question with comprehensive validation
   */
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
    is_demo: boolean = false
  ): Promise<QuestionModel> {
    // Validate required fields
    if (!question || question.trim().length === 0) {
      throw new ValidationException(
        "Question text is required",
        "question",
        question
      );
    }

    if (!hint || hint.trim().length === 0) {
      throw new ValidationException("Hint is required", "hint", hint);
    }

    if (!answer_type || answer_type.trim().length === 0) {
      throw new ValidationException(
        "Answer type is required",
        "answer_type",
        answer_type
      );
    }

    if (!input_type || input_type.trim().length === 0) {
      throw new ValidationException(
        "Input type is required",
        "input_type",
        input_type
      );
    }

    // Validate priority_level
    const validPriorities = [
      "high priority",
      "medium priority",
      "low priority",
    ];
    if (!validPriorities.includes(priority_level)) {
      throw new ValidationException(
        "Invalid priority level",
        "priority_level",
        priority_level
      );
    }

    // Validate subtopic_id
    if (!numberValidation(subtopic_id, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required (must be >= 1)",
        "subtopic_id",
        subtopic_id
      );
    }

    // Validate order_no if provided
    if (order_no !== undefined && !numberValidation(order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no
      );
    }

    // Create and return the question model instance
    const questionModel = new QuestionModel();
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
    questionModel.status = "Not started"; // Default status
    questionModel.is_demo = is_demo;
    questionModel.created_at = new Date();

    return questionModel;
  }

  /**
   * Update question information with validation
   */
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
    // Validate question if provided
    if (updateData.question !== undefined) {
      if (!updateData.question || updateData.question.trim().length === 0) {
        throw new ValidationException(
          "Question text is required",
          "question",
          updateData.question
        );
      }
      this.question = updateData.question.trim();
    }

    // Validate hint if provided
    if (updateData.hint !== undefined) {
      if (!updateData.hint || updateData.hint.trim().length === 0) {
        throw new ValidationException(
          "Hint is required",
          "hint",
          updateData.hint
        );
      }
      this.hint = updateData.hint.trim();
    }

    // Validate priority_level if provided
    if (updateData.priority_level !== undefined) {
      const validPriorities = [
        "high priority",
        "medium priority",
        "low priority",
      ];
      if (!validPriorities.includes(updateData.priority_level)) {
        throw new ValidationException(
          "Invalid priority level",
          "priority_level",
          updateData.priority_level
        );
      }
      this.priority_level = updateData.priority_level;
    }

    // Validate answer_type if provided
    if (updateData.answer_type !== undefined) {
      if (
        !updateData.answer_type ||
        updateData.answer_type.trim().length === 0
      ) {
        throw new ValidationException(
          "Answer type is required",
          "answer_type",
          updateData.answer_type
        );
      }
      this.answer_type = updateData.answer_type.trim();
    }

    // Validate input_type if provided
    if (updateData.input_type !== undefined) {
      if (!updateData.input_type || updateData.input_type.trim().length === 0) {
        throw new ValidationException(
          "Input type is required",
          "input_type",
          updateData.input_type
        );
      }
      this.input_type = updateData.input_type.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 1)) {
        throw new ValidationException(
          "Order number must be a positive integer",
          "order_no",
          updateData.order_no
        );
      }
      this.order_no = updateData.order_no;
    }

    // Validate status if provided
    if (updateData.status !== undefined) {
      const validStatuses = ["Not started", "In progress", "Done"];
      if (!validStatuses.includes(updateData.status)) {
        throw new ValidationException(
          "Invalid status value",
          "status",
          updateData.status
        );
      }
      this.status = updateData.status;
    }

    // Update boolean fields if provided
    if (updateData.evidence_required !== undefined) {
      this.evidence_required = updateData.evidence_required;
    }

    if (updateData.is_required !== undefined) {
      this.is_required = updateData.is_required;
    }

    // Update arrays if provided
    if (updateData.dropdown_options !== undefined) {
      this.dropdown_options = updateData.dropdown_options;
    }

    if (updateData.evidence_files !== undefined) {
      this.evidence_files = updateData.evidence_files;
    }

    // Update answer if provided
    if (updateData.answer !== undefined) {
      this.answer = updateData.answer;
    }
  }

  /**
   * Validate question data before saving
   */
  async validateQuestionData(): Promise<void> {
    if (!this.question || this.question.trim().length === 0) {
      throw new ValidationException(
        "Question text is required",
        "question",
        this.question
      );
    }

    if (!this.hint || this.hint.trim().length === 0) {
      throw new ValidationException("Hint is required", "hint", this.hint);
    }

    if (!this.answer_type || this.answer_type.trim().length === 0) {
      throw new ValidationException(
        "Answer type is required",
        "answer_type",
        this.answer_type
      );
    }

    if (!this.input_type || this.input_type.trim().length === 0) {
      throw new ValidationException(
        "Input type is required",
        "input_type",
        this.input_type
      );
    }

    if (!this.subtopic_id || !numberValidation(this.subtopic_id, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required",
        "subtopic_id",
        this.subtopic_id
      );
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no
      );
    }
  }

  /**
   * Check if question is a demo question
   */
  isDemoQuestion(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if question can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoQuestion()) {
      throw new BusinessLogicException(
        "Demo questions cannot be modified",
        "DEMO_QUESTION_RESTRICTION",
        { questionId: this.id, subtopicId: this.subtopic_id }
      );
    }
    return true;
  }

  /**
   * Check if question is completed
   */
  isCompleted(): boolean {
    return this.status === "Done";
  }

  /**
   * Check if question is in progress
   */
  isInProgress(): boolean {
    return this.status === "In progress";
  }

  /**
   * Check if question is not started
   */
  isNotStarted(): boolean {
    return this.status === "Not started" || !this.status;
  }

  /**
   * Check if question has high priority
   */
  hasHighPriority(): boolean {
    return this.priority_level === "high priority";
  }

  /**
   * Check if question requires evidence
   */
  requiresEvidence(): boolean {
    return this.evidence_required;
  }

  /**
   * Check if question is required
   */
  isRequired(): boolean {
    return this.is_required;
  }

  /**
   * Get question progress percentage
   */
  getProgressPercentage(): number {
    if (this.isCompleted()) {
      return 100;
    }
    if (this.isInProgress()) {
      return 50;
    }
    return 0;
  }

  /**
   * Get question summary for display
   */
  getSummary(): {
    id: number | undefined;
    question: string;
    priority: string;
    status: string;
    progress: number;
    requiresEvidence: boolean;
  } {
    return {
      id: this.id,
      question: this.question,
      priority: this.priority_level,
      status: this.status || "Not started",
      progress: this.getProgressPercentage(),
      requiresEvidence: this.requiresEvidence(),
    };
  }

  /**
   * Convert question model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      order_no: this.order_no,
      question: this.question,
      hint: this.hint,
      priority_level: this.priority_level,
      answer_type: this.answer_type,
      input_type: this.input_type,
      evidence_required: this.evidence_required,
      is_required: this.is_required,
      dropdown_options: this.dropdown_options,
      evidence_files: this.evidence_files,
      answer: this.answer,
      subtopic_id: this.subtopic_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      status: this.status,
      progressPercentage: this.getProgressPercentage(),
    };
  }

  /**
   * Create QuestionModel instance from JSON data
   */
  static fromJSON(json: any): QuestionModel {
    return new QuestionModel(json);
  }

  /**
   * Static method to find question by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<QuestionModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    const question = await QuestionModel.findByPk(id);
    if (!question) {
      throw new NotFoundException("Question not found", "Question", id);
    }

    return question;
  }

  /**
   * Static method to find questions by subtopic ID
   */
  static async findBySubtopicId(subtopicId: number): Promise<QuestionModel[]> {
    if (!numberValidation(subtopicId, 1)) {
      throw new ValidationException(
        "Valid subtopic_id is required (must be >= 1)",
        "subtopic_id",
        subtopicId
      );
    }

    return await QuestionModel.findAll({
      where: { subtopic_id: subtopicId },
      order: [["order_no", "ASC"]],
    });
  }

  /**
   * Static method to update question by ID
   */
  static async updateQuestionById(
    id: number,
    updateData: Partial<IQuestion>
  ): Promise<[number, QuestionModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await QuestionModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete question by ID
   */
  static async deleteQuestionById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await QuestionModel.destroy({
      where: { id },
    });
  }

  constructor(init?: Partial<IQuestion>) {
    super();
    Object.assign(this, init);
  }
}
