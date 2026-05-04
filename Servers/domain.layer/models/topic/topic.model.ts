import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { AssessmentModel } from "../assessment/assessment.model";
import { ITopic } from "../../interfaces/i.topic";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "topics",
  timestamps: true,
  underscored: true,
})
export class TopicModel extends Model<TopicModel> implements ITopic {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  title!: string;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @ForeignKey(() => AssessmentModel)
  @Column({
    type: DataType.INTEGER,
  })
  assessment_id!: number;

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

  /**
   * Create a new topic with comprehensive validation
   */
  static async createNewTopic(
    title: string,
    assessment_id: number,
    order_no?: number,
    is_demo: boolean = false,
  ): Promise<TopicModel> {
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
    const topic = new TopicModel();
    topic.title = title.trim();
    topic.assessment_id = assessment_id;
    topic.order_no = order_no;
    topic.is_demo = is_demo;
    topic.created_at = new Date();

    return topic;
  }

  /**
   * Update topic information with validation
   */
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

  /**
   * Validate topic data before saving
   */
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

  /**
   * Check if topic is a demo topic
   */
  isDemoTopic(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if topic can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoTopic()) {
      throw new BusinessLogicException("Demo topics cannot be modified", "DEMO_TOPIC_RESTRICTION", {
        topicId: this.id,
        assessmentId: this.assessment_id,
      });
    }
    return true;
  }

  /**
   * Get topic summary for display
   */
  getSummary(): {
    id: number | undefined;
    title: string;
    orderNo: number | undefined;
    assessmentId: number;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      title: this.title,
      orderNo: this.order_no,
      assessmentId: this.assessment_id,
      isDemo: this.isDemoTopic(),
    };
  }

  /**
   * Convert topic model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      order_no: this.order_no,
      assessment_id: this.assessment_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create TopicModel instance from JSON data
   */
  static fromJSON(json: any): TopicModel {
    return new TopicModel(json);
  }

  /**
   * Static method to find topic by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<TopicModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const topic = await TopicModel.findByPk(id);
    if (!topic) {
      throw new NotFoundException("Topic not found", "Topic", id);
    }

    return topic;
  }

  /**
   * Static method to find topics by assessment ID
   */
  static async findByAssessmentId(assessmentId: number): Promise<TopicModel[]> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return await TopicModel.findAll({
      where: { assessment_id: assessmentId },
      order: [["order_no", "ASC"]],
    });
  }

  constructor(init?: Partial<ITopic>) {
    super();
    Object.assign(this, init);
  }
}
