import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../../models/project/project.model";
import { ProjectFrameworksModel } from "../../models/projectFrameworks/projectFrameworks.model";

/*

This is the new Assessment model(Schema) and will be replaced with the new one.
Please align other files with this

In fact nothing specific has changedn but we're only 
changing "projectId" to "project_id" for more consistancy

*/
export type AssessmentEU = {
  id?: number;
  project_id: number;
  projects_frameworks_id?: number;
  created_at?: Date;
};

@Table({
  tableName: "assessments",
})
export class AssessmentEUModel extends Model<AssessmentEU> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
  })
  project_id!: number;

  @ForeignKey(() => ProjectFrameworksModel)
  @Column({
    type: DataType.INTEGER,
  })
  projects_frameworks_id!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @Column({
    type: DataType.DATE,
  })
  created_at?: Date;
}
