export class ProjectsMembersModel {
  user_id!: number;
  project_id!: number;
  is_demo?: boolean;

  constructor(data: ProjectsMembersModel) {
    this.user_id = data.user_id;
    this.project_id = data.project_id;
    this.is_demo = data.is_demo;
  }

  static createNewProjectsMembers(data: ProjectsMembersModel): ProjectsMembersModel {
    return new ProjectsMembersModel(data);
  }
}
