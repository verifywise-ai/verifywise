export class ProjectFrameworksModel {
  framework_id!: number;
  project_id!: number;
  is_demo?: boolean;

  constructor(data: ProjectFrameworksModel) {
    this.framework_id = data.framework_id;
    this.project_id = data.project_id;
    this.is_demo = data.is_demo;
  }

  static createNewProjectFrameworks(data: ProjectFrameworksModel): ProjectFrameworksModel {
    return new ProjectFrameworksModel(data);
  }
}
