import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { IISO27001ClauseStruct } from "../../interfaces/i.ISO27001ClauseStruct";
import { FrameworkModel } from "../../models/frameworks/frameworks.model";

@Table({
  tableName: "clauses_struct_iso27001",
  timestamps: true,
})
export class ISO27001ClauseStructModel
  extends Model<ISO27001ClauseStructModel>
  implements IISO27001ClauseStruct
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  arrangement!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @ForeignKey(() => FrameworkModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  framework_id!: number;

  // /**
  //  * Create a new ISO27001 Clause
  //  */
  // static async createNewClause(
  //   clauseAttributes: Partial<ISO27001ClauseModel>
  // ): Promise<ISO27001ClauseModel> {
  //   // Validate required fields
  //   if (
  //     !clauseAttributes.arrangement ||
  //     !numberValidation(clauseAttributes.arrangement, 1)
  //   ) {
  //     throw new ValidationException(
  //       "Valid arrangement is required (must be >= 1)",
  //       "arrangement",
  //       clauseAttributes.arrangement
  //     );
  //   }

  //   if (
  //     !clauseAttributes.title ||
  //     clauseAttributes.title.trim().length === 0
  //   ) {
  //     throw new ValidationException(
  //       "Title is required",
  //       "title",
  //       clauseAttributes.title
  //     );
  //   }

  //   if (
  //     !clauseAttributes.framework_id ||
  //     !numberValidation(clauseAttributes.framework_id, 1)
  //   ) {
  //     throw new ValidationException(
  //       "Valid framework_id is required (must be >= 1)",
  //       "framework_id",
  //       clauseAttributes.framework_id
  //     );
  //   }

  //   // Create and return the clause model instance
  //   const clause = new ISO27001ClauseModel();
  //   clause.arrangement = clauseAttributes.arrangement;
  //   clause.title = clauseAttributes.title.trim();
  //   clause.framework_id = clauseAttributes.framework_id;

  //   return clause;
  // }

  // /**
  //  * Update clause information
  //  */
  // async updateClause(updateData: Partial<ISO27001ClauseModel>): Promise<void> {
  //   // Validate arrangement if provided
  //   if (updateData.arrangement !== undefined) {
  //     if (!numberValidation(updateData.arrangement, 1)) {
  //       throw new ValidationException(
  //         "Valid arrangement is required (must be >= 1)",
  //         "arrangement",
  //         updateData.arrangement
  //       );
  //     }
  //     this.arrangement = updateData.arrangement;
  //   }

  //   // Validate title if provided
  //   if (updateData.title !== undefined) {
  //     if (
  //       !updateData.title ||
  //       updateData.title.trim().length === 0
  //     ) {
  //       throw new ValidationException(
  //         "Title is required",
  //         "title",
  //         updateData.title
  //       );
  //     }
  //     this.title = updateData.title.trim();
  //   }

  //   // Validate framework_id if provided
  //   if (updateData.framework_id !== undefined) {
  //     if (!numberValidation(updateData.framework_id, 1)) {
  //       throw new ValidationException(
  //         "Valid framework_id is required (must be >= 1)",
  //         "framework_id",
  //         updateData.framework_id
  //       );
  //     }
  //     this.framework_id = updateData.framework_id;
  //   }
  // }

  // /**
  //  * Validate clause data before saving
  //  */
  // async validateClauseData(): Promise<void> {
  //   if (!numberValidation(this.arrangement, 1)) {
  //     throw new ValidationException(
  //       "Valid arrangement is required (must be >= 1)",
  //       "arrangement",
  //       this.arrangement
  //     );
  //   }

  //   if (!this.title || this.title.trim().length === 0) {
  //     throw new ValidationException(
  //       "Title is required",
  //       "title",
  //       this.title
  //     );
  //   }

  //   if (!numberValidation(this.framework_id, 1)) {
  //     throw new ValidationException(
  //       "Valid framework_id is required (must be >= 1)",
  //       "framework_id",
  //       this.framework_id
  //     );
  //   }
  // }

  /**
   * Create ISO27001ClauseModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001ClauseStructModel {
    return new ISO27001ClauseStructModel(json);
  }

  /**
   * Convert clause model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      arrangement: this.arrangement,
      title: this.title,
      framework_id: this.framework_id,
    };
  }

  /**
   * Get clause display name
   */
  getDisplayName(): string {
    return `${this.arrangement}. ${this.title}`;
  }
}
