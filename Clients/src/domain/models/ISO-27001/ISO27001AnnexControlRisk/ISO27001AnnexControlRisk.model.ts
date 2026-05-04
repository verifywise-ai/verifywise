export class ISO27001AnnexControlRiskModel {
  annexcontrol_id?: number;
  projects_risks_id?: number;

  constructor(data: ISO27001AnnexControlRiskModel) {
    this.annexcontrol_id = data.annexcontrol_id;
    this.projects_risks_id = data.projects_risks_id;
  }

  static createNewISO27001AnnexControlRisk(
    data: ISO27001AnnexControlRiskModel,
  ): ISO27001AnnexControlRiskModel {
    return new ISO27001AnnexControlRiskModel(data);
  }
}
