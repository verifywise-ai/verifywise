export class ISO27001SubClauseRiskModel {
  subclause_id?: number;
  projects_risks_id?: number;

  constructor(data: ISO27001SubClauseRiskModel) {
    this.subclause_id = data.subclause_id;
    this.projects_risks_id = data.projects_risks_id;
  }

  static createNewISO27001SubClauseRisk(
    data: ISO27001SubClauseRiskModel,
  ): ISO27001SubClauseRiskModel {
    return new ISO27001SubClauseRiskModel(data);
  }
}
