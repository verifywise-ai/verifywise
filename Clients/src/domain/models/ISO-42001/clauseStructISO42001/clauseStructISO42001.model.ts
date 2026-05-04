export class ClauseStructISO42001Model {
  id!: number;
  title!: string;
  clause_no!: number;
  framework_id?: number;

  constructor(data: ClauseStructISO42001Model) {
    this.id = data.id;
    this.title = data.title;
    this.clause_no = data.clause_no;
    this.framework_id = data.framework_id;
  }

  static createNewClauseStructISO42001(data: ClauseStructISO42001Model): ClauseStructISO42001Model {
    return new ClauseStructISO42001Model(data);
  }
}
