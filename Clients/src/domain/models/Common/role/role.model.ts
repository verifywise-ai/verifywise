export class RoleModel {
  id?: number;
  name!: string;
  description!: string;
  is_demo?: boolean;
  created_at?: Date;
  /** NULL/undefined = global built-in role; set = custom organization role (issue #4588). */
  organization_id?: number | null;

  constructor(data: RoleModel) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
    this.organization_id = data.organization_id;
  }

  static createRole(data: RoleModel): RoleModel {
    return new RoleModel(data);
  }
}
