import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { TopicModel } from "../topic/topic.model";
import { ISubtopic } from "../../interfaces/i.subtopic";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "subtopics",
  timestamps: true,
  underscored: true,
})
export class SubtopicModel extends Model<SubtopicModel> implements ISubtopic {
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

  @ForeignKey(() => TopicModel)
  @Column({
    type: DataType.INTEGER,
  })
  topic_id!: number;

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
   * Create a new subtopic with comprehensive validation
   */
  static async createNewSubtopic(
    title: string,
    topic_id: number,
    order_no?: number,
    is_demo: boolean = false,
  ): Promise<SubtopicModel> {
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
    const subtopic = new SubtopicModel();
    subtopic.title = title.trim();
    subtopic.topic_id = topic_id;
    subtopic.order_no = order_no;
    subtopic.is_demo = is_demo;
    subtopic.created_at = new Date();

    return subtopic;
  }

  /**
   * Update subtopic information with validation
   */
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

  /**
   * Validate subtopic data before saving
   */
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

  /**
   * Check if subtopic is a demo subtopic
   */
  isDemoSubtopic(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if subtopic can be modified
   */
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

  /**
   * Get subtopic summary for display
   */
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

  /**
   * Convert subtopic model to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      title: this.title,
      order_no: this.order_no,
      topic_id: this.topic_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      // Include dynamically added properties from queries
      questions: dataValues?.questions,
    };
  }

  /**
   * Create SubtopicModel instance from JSON data
   */
  static fromJSON(json: any): SubtopicModel {
    return new SubtopicModel(json);
  }

  /**
   * Static method to find subtopic by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<SubtopicModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const subtopic = await SubtopicModel.findByPk(id);
    if (!subtopic) {
      throw new NotFoundException("Subtopic not found", "Subtopic", id);
    }

    return subtopic;
  }

  /**
   * Static method to find subtopics by topic ID
   */
  static async findByTopicId(topicId: number): Promise<SubtopicModel[]> {
    if (!numberValidation(topicId, 1)) {
      throw new ValidationException(
        "Valid topic_id is required (must be >= 1)",
        "topic_id",
        topicId,
      );
    }

    return await SubtopicModel.findAll({
      where: { topic_id: topicId },
      order: [["order_no", "ASC"]],
    });
  }

  constructor(init?: Partial<ISubtopic>) {
    super();
    Object.assign(this, init);
  }
}
