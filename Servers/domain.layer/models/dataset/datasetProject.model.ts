import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IDatasetProject } from "../../interfaces/i.dataset";

@Table({
  tableName: "dataset_projects",
  timestamps: false,
  underscored: true,
})
export class DatasetProjectModel extends Model<DatasetProjectModel> implements IDatasetProject {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    references: {
      model: "datasets",
      key: "id",
    },
    onDelete: "CASCADE",
  })
  dataset_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    references: {
      model: "projects",
      key: "id",
    },
    onDelete: "CASCADE",
  })
  project_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  toJSON(): any {
    return {
      id: this.id,
      dataset_id: this.dataset_id,
      project_id: this.project_id,
      created_at:
        (this.createdAt ?? this.created_at)?.toISOString?.() || this.createdAt || this.created_at,
    };
  }

  constructor(init?: Partial<IDatasetProject>) {
    super();
    Object.assign(this, init);
  }
}
