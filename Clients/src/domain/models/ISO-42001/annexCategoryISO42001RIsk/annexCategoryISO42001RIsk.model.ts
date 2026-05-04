export class AnnexCategoryISO42001RiskModel {
  annexcategory_id?: number;
  projects_risks_id?: number;

  constructor(data: AnnexCategoryISO42001RiskModel) {
    this.annexcategory_id = data.annexcategory_id;
    this.projects_risks_id = data.projects_risks_id;
  }

  static createNewAnnexCategoryISO42001Risk(
    data: AnnexCategoryISO42001RiskModel,
  ): AnnexCategoryISO42001RiskModel {
    return new AnnexCategoryISO42001RiskModel(data);
  }
}
