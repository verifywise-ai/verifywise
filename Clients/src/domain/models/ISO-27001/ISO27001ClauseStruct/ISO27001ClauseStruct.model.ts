export class ISO27001ClauseStructModel {
  id?: number;
  arrangement!: number;
  title!: string;
  framework_id!: number;

  constructor(data: ISO27001ClauseStructModel) {
    this.id = data.id;
    this.arrangement = data.arrangement;
    this.title = data.title;
    this.framework_id = data.framework_id;
  }

  static createNewISO27001ClauseStruct(data: ISO27001ClauseStructModel): ISO27001ClauseStructModel {
    return new ISO27001ClauseStructModel(data);
  }
}
