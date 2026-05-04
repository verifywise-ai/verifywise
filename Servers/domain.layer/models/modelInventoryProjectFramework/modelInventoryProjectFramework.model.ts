import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { IModelInventoryProjectFramework } from "../../interfaces/i.modelInventoryProjectFramework";
import { ModelInventoryModel } from "../modelInventory/modelInventory.model";
import { ProjectModel } from "../project/project.model";
import { ValidationException } from "../../exceptions/custom.exception";
import { FrameworkModel } from "../frameworks/frameworks.model";

@Table({
  tableName: "model_inventories_projects_frameworks",
  timestamps: true,
  underscored: true,
})
export class ModelInventoryProjectFrameworkModel
  extends Model<ModelInventoryProjectFrameworkModel>
  implements IModelInventoryProjectFramework
{
  @ForeignKey(() => ModelInventoryModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  model_inventory_id!: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    primaryKey: true,
  })
  project_id?: number;

  @ForeignKey(() => FrameworkModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    primaryKey: true,
  })
  framework_id?: number;

  /**
   * Validate that at least project_id or framework_id is present
   */
  async validateRelation(): Promise<void> {
    if (!this.project_id && !this.framework_id) {
      throw new ValidationException(
        "Either project_id or framework_id must be provided",
        "project_framework",
        null,
      );
    }
  }

  /**
   * Check if relation includes a project
   */
  hasProject(): boolean {
    return this.project_id !== null && this.project_id !== undefined;
  }

  /**
   * Check if relation includes a framework
   */
  hasFramework(): boolean {
    return this.framework_id !== null && this.framework_id !== undefined;
  }

  /**
   * Check if relation includes both project and framework
   */
  hasBoth(): boolean {
    return this.hasProject() && this.hasFramework();
  }

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
   * Get relation type
   */
  getRelationType(): "project" | "framework" | "both" {
    if (this.hasBoth()) return "both";
    if (this.hasProject()) return "project";
    return "framework";
  }

  /**
   * Convert to safe JSON
   */
  toSafeJSON(): any {
    return {
      model_inventory_id: this.model_inventory_id,
      project_id: this.project_id,
      framework_id: this.framework_id,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: any): ModelInventoryProjectFrameworkModel {
    return new ModelInventoryProjectFrameworkModel(json);
  }

  constructor(init?: Partial<IModelInventoryProjectFramework>) {
    super();
    Object.assign(this, init);
  }
}
