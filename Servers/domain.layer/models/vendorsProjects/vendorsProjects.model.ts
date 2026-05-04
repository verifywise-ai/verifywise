import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../project/project.model";
import { VendorModel } from "../vendor/vendor.model";
import { IVendorsProjects } from "../../interfaces/i.vendorProjects";

@Table({
  tableName: "vendor_projects",
  timestamps: true,
  underscored: true,
})
export class VendorsProjectsModel extends Model<VendorsProjectsModel> implements IVendorsProjects {
  @ForeignKey(() => VendorModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  vendor_id!: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  project_id!: number;

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

  static async createNewVendorProject(
    vendorId: number,
    projectId: number,
    is_demo: boolean = false,
  ): Promise<VendorsProjectsModel> {
    const vendorProject = new VendorsProjectsModel();
    vendorProject.vendor_id = vendorId;
    vendorProject.project_id = projectId;
    vendorProject.is_demo = is_demo;
    return vendorProject;
  }
}
