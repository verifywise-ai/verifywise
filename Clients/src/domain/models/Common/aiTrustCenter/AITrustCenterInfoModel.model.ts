export class AITrustCenterInfoModel {
  id?: number;
  title!: string;
  logo?: number;
  visible!: boolean;
  header_color!: string;
  intro_visible!: boolean;
  compliance_badges_visible!: boolean;
  company_description_visible!: boolean;
  terms_and_contact_visible!: boolean;
  resources_visible!: boolean;
  subprocessor_visible!: boolean;

  constructor(data: AITrustCenterInfoModel) {
    this.id = data.id;
    this.title = data.title;
    this.logo = data.logo;
    this.visible = data.visible;
    this.header_color = data.header_color;
    this.intro_visible = data.intro_visible;
    this.compliance_badges_visible = data.compliance_badges_visible;
    this.company_description_visible = data.company_description_visible;
    this.terms_and_contact_visible = data.terms_and_contact_visible;
    this.resources_visible = data.resources_visible;
    this.subprocessor_visible = data.subprocessor_visible;
  }

  static createNewAITrustCenterInfo(data: AITrustCenterInfoModel): AITrustCenterInfoModel {
    return new AITrustCenterInfoModel(data);
  }
}
