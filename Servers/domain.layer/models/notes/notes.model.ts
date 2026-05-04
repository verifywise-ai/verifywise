/**
 * @fileoverview Notes Model
 *
 * Defines the Notes entity for collaborative annotation system.
 * Allows users to attach contextual notes to various entities across the platform.
 *
 * Database Schema:
 * - id: UUID primary key
 * - content: Note text content (max 5000 chars)
 * - author_id: Foreign key to UserModel (note creator)
 * - attached_to: Enum of entity types (NIST_SUBCATEGORY, ISO_42001_CLAUSE, etc.)
 * - attached_to_id: String ID of the entity
 * - organization_id: Foreign key to OrganizationModel (multi-tenancy)
 * - is_edited: Boolean flag for tracking edits
 * - created_at: Note creation timestamp
 * - updated_at: Last update timestamp
 *
 * Key Features:
 * - UUID-based primary key for distributed systems
 * - Organization-scoped for multi-tenancy
 * - Supports multiple entity types
 * - Tracks edit status with updated_at field
 * - Author information linked via foreign key
 *
 * Supported Entity Types:
 * - NIST_SUBCATEGORY: NIST AI RMF subcategories
 * - ISO_42001_CLAUSE: ISO 42001 clauses
 * - ISO_42001_ANNEX: ISO 42001 annexes
 * - ISO_27001_CLAUSE: ISO 27001 clauses
 * - ISO_27001_ANNEX: ISO 27001 annexes
 * - EU_AI_ACT_QUESTION: EU AI Act assessment questions
 * - EU_AI_ACT_SUBCONTROL: EU AI Act subcontrols
 * - VENDOR: Vendor entities
 * - RISK: Risk entities
 * - CONTROL: Control entities
 *
 * @module domain.layer/models/notes
 */

import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { OrganizationModel } from "../organization/organization.model";
import { ValidationException } from "../../exceptions/custom.exception";

// Enum for supported entity types
export enum NotesAttachedToEnum {
  NIST_SUBCATEGORY = "NIST_SUBCATEGORY",
  ISO_42001_CLAUSE = "ISO_42001_CLAUSE",
  ISO_42001_ANNEX = "ISO_42001_ANNEX",
  ISO_27001_CLAUSE = "ISO_27001_CLAUSE",
  ISO_27001_ANNEX = "ISO_27001_ANNEX",
  EU_AI_ACT_QUESTION = "EU_AI_ACT_QUESTION",
  EU_AI_ACT_SUBCONTROL = "EU_AI_ACT_SUBCONTROL",
  VENDOR = "VENDOR",
  RISK = "RISK",
  CONTROL = "CONTROL",
}

@Table({
  tableName: "notes",
  timestamps: true,
  underscored: true,
})
export class NotesModel extends Model<NotesModel> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    validate: {
      len: [1, 5000],
    },
  })
  content!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  author_id!: number;

  @Column({
    type: DataType.ENUM(
      NotesAttachedToEnum.NIST_SUBCATEGORY,
      NotesAttachedToEnum.ISO_42001_CLAUSE,
      NotesAttachedToEnum.ISO_42001_ANNEX,
      NotesAttachedToEnum.ISO_27001_CLAUSE,
      NotesAttachedToEnum.ISO_27001_ANNEX,
      NotesAttachedToEnum.EU_AI_ACT_QUESTION,
      NotesAttachedToEnum.EU_AI_ACT_SUBCONTROL,
      NotesAttachedToEnum.VENDOR,
      NotesAttachedToEnum.RISK,
      NotesAttachedToEnum.CONTROL,
    ),
    allowNull: false,
  })
  attached_to!: NotesAttachedToEnum;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  attached_to_id!: string;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @BelongsTo(() => UserModel, { as: "author" })
  author?: UserModel;

  @BelongsTo(() => OrganizationModel)
  organization?: OrganizationModel;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_edited?: boolean;

  @Column({
    type: DataType.DATE,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
  })
  updated_at?: Date;

  /**
   * Creates a new note with validation
   *
   * Factory method that creates a NotesModel instance with validated data.
   * Does NOT save to database - caller must persist using query utilities.
   *
   * @static
   * @async
   * @param {string} content - Note content (max 5000 chars)
   * @param {number} author_id - User ID of note author
   * @param {NotesAttachedToEnum} attached_to - Entity type
   * @param {string} attached_to_id - ID of the entity
   * @param {number} organization_id - Organization ID for multi-tenancy
   * @returns {Promise<NotesModel>} NotesModel instance (not yet persisted)
   * @throws {ValidationException} If any field fails validation
   *
   * @example
   * const note = await NotesModel.createNote(
   *   'This is my note',
   *   123,
   *   NotesAttachedToEnum.NIST_SUBCATEGORY,
   *   'subcategory-123',
   *   456
   * );
   */
  static async createNote(
    content: string,
    author_id: number,
    attached_to: NotesAttachedToEnum,
    attached_to_id: string,
    organization_id: number,
  ): Promise<NotesModel> {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new ValidationException("Note content is required", "content", content);
    }

    if (content.trim().length > 5000) {
      throw new ValidationException(
        "Note content cannot exceed 5000 characters",
        "content",
        content,
      );
    }

    // Validate author_id
    if (!author_id || author_id < 1) {
      throw new ValidationException(
        "Valid author_id is required (must be >= 1)",
        "author_id",
        author_id,
      );
    }

    // Validate attached_to
    if (!attached_to || !Object.values(NotesAttachedToEnum).includes(attached_to)) {
      throw new ValidationException(
        "Valid attached_to type is required",
        "attached_to",
        attached_to,
      );
    }

    // Validate attached_to_id
    if (!attached_to_id || attached_to_id.trim().length === 0) {
      throw new ValidationException("attached_to_id is required", "attached_to_id", attached_to_id);
    }

    // Validate organization_id
    if (!organization_id || organization_id < 1) {
      throw new ValidationException(
        "Valid organization_id is required (must be >= 1)",
        "organization_id",
        organization_id,
      );
    }

    // Create and return the note model instance
    const note = new NotesModel();
    note.content = content.trim();
    note.author_id = author_id;
    note.attached_to = attached_to;
    note.attached_to_id = attached_to_id;
    note.organization_id = organization_id;
    note.is_edited = false;
    note.created_at = new Date();
    note.updated_at = new Date();

    return note;
  }

  /**
   * Updates note content with validation
   *
   * Allows updating the content of a note and marks it as edited.
   * Changes are applied to the instance but not persisted to database.
   *
   * @async
   * @param {string} content - New note content (max 5000 chars)
   * @returns {Promise<void>}
   * @throws {ValidationException} If content fails validation
   *
   * @example
   * await note.updateContent('Updated note content');
   * // Note instance updated but not saved to database yet
   */
  async updateContent(content: string): Promise<void> {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new ValidationException("Note content is required", "content", content);
    }

    if (content.trim().length > 5000) {
      throw new ValidationException(
        "Note content cannot exceed 5000 characters",
        "content",
        content,
      );
    }

    this.content = content.trim();
    this.is_edited = true;
    this.updated_at = new Date();
  }

  /**
   * Validates all note data fields before persistence
   *
   * Performs comprehensive validation of all required fields.
   * Should be called before saving note to database.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {ValidationException} If any required field is missing or invalid
   *
   * @validation
   * - Content: Required, non-empty, max 5000 chars
   * - Author ID: Required, >= 1
   * - Attached To: Required, valid enum value
   * - Attached To ID: Required, non-empty string
   * - Organization ID: Required, >= 1
   *
   * @example
   * await note.validateNoteData();
   * // Throws ValidationException if any field is invalid
   */
  async validateNoteData(): Promise<void> {
    if (!this.content || this.content.trim().length === 0) {
      throw new ValidationException("Note content is required", "content", this.content);
    }

    if (this.content.trim().length > 5000) {
      throw new ValidationException(
        "Note content cannot exceed 5000 characters",
        "content",
        this.content,
      );
    }

    if (!this.author_id || this.author_id < 1) {
      throw new ValidationException(
        "Valid author_id is required (must be >= 1)",
        "author_id",
        this.author_id,
      );
    }

    if (!this.attached_to || !Object.values(NotesAttachedToEnum).includes(this.attached_to)) {
      throw new ValidationException(
        "Valid attached_to type is required",
        "attached_to",
        this.attached_to,
      );
    }

    if (!this.attached_to_id || this.attached_to_id.trim().length === 0) {
      throw new ValidationException(
        "attached_to_id is required",
        "attached_to_id",
        this.attached_to_id,
      );
    }

    if (!this.organization_id || this.organization_id < 1) {
      throw new ValidationException(
        "Valid organization_id is required (must be >= 1)",
        "organization_id",
        this.organization_id,
      );
    }
  }

  /**
   * Checks if note is authored by the specified user
   *
   * @param {number} userId - User ID to check
   * @returns {boolean} True if user is the author
   *
   * @example
   * if (note.isAuthoredBy(currentUserId)) {
   *   // User can edit/delete note
   * }
   */
  isAuthoredBy(userId: number): boolean {
    return this.author_id === userId;
  }

  /**
   * Checks if note is associated with a specific entity
   *
   * @param {NotesAttachedToEnum} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @returns {boolean} True if note is attached to this entity
   *
   * @example
   * if (note.isAttachedTo(NotesAttachedToEnum.NIST_SUBCATEGORY, 'sub-123')) {
   *   // Note belongs to this entity
   * }
   */
  isAttachedTo(entityType: NotesAttachedToEnum, entityId: string): boolean {
    return this.attached_to === entityType && this.attached_to_id === entityId;
  }

  /**
   * Convert note to JSON representation for API response
   *
   * Includes all note data with formatted dates and author information.
   *
   * @returns {Object} Note data in JSON format
   *
   * @example
   * const noteJson = note.toJSON();
   * res.json(noteJson);
   */
  toJSON(): any {
    return {
      id: this.id,
      content: this.content,
      author_id: this.author_id,
      author: this.author,
      attached_to: this.attached_to,
      attached_to_id: this.attached_to_id,
      organization_id: this.organization_id,
      is_edited: this.is_edited,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create NotesModel instance from JSON data
   *
   * @static
   * @param {any} json - JSON data
   * @returns {NotesModel} NotesModel instance
   *
   * @example
   * const note = NotesModel.fromJSON(jsonData);
   */
  static fromJSON(json: any): NotesModel {
    return new NotesModel(json);
  }

  constructor(init?: Partial<NotesModel>) {
    super();
    Object.assign(this, init);
  }
}
