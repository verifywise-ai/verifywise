export class SubClauseISO42001RiskModel {
  subclause_id!: number;
  projects_risks_id!: number;

  constructor(data: SubClauseISO42001RiskModel) {
    this.subclause_id = data.subclause_id;
    this.projects_risks_id = data.projects_risks_id;
  }

  static createNewSubClauseISO42001Risk(
    data: SubClauseISO42001RiskModel,
  ): SubClauseISO42001RiskModel {
    return new SubClauseISO42001RiskModel(data);
  }
}
