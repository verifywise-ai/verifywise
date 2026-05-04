export class AITrustCenterCompanyDescriptionModel {
  id?: number;
  background_visible!: boolean;
  background_text!: string;
  core_benefits_visible!: boolean;
  core_benefits_text!: string;
  compliance_doc_visible!: boolean;
  compliance_doc_text!: string;

  constructor(data: AITrustCenterCompanyDescriptionModel) {
    this.id = data.id;
    this.background_visible = data.background_visible;
    this.background_text = data.background_text;
    this.core_benefits_visible = data.core_benefits_visible;
    this.core_benefits_text = data.core_benefits_text;
    this.compliance_doc_visible = data.compliance_doc_visible;
    this.compliance_doc_text = data.compliance_doc_text;
  }

  static createNewAITrustCenterCompanyDescription(
    data: AITrustCenterCompanyDescriptionModel,
  ): AITrustCenterCompanyDescriptionModel {
    return new AITrustCenterCompanyDescriptionModel(data);
  }
}
