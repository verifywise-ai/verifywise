export class AITrustCenterComplianceBadgesModel {
  id?: number;
  soc2_type_i!: boolean;
  soc2_type_ii!: boolean;
  iso_27001!: boolean;
  iso_42001!: boolean;
  ccpa!: boolean;
  gdpr!: boolean;
  hipaa!: boolean;
  eu_ai_act!: boolean;

  constructor(data: AITrustCenterComplianceBadgesModel) {
    this.id = data.id;
    this.soc2_type_i = data.soc2_type_i;
    this.soc2_type_ii = data.soc2_type_ii;
    this.iso_27001 = data.iso_27001;
    this.iso_42001 = data.iso_42001;
    this.ccpa = data.ccpa;
    this.gdpr = data.gdpr;
    this.hipaa = data.hipaa;
    this.eu_ai_act = data.eu_ai_act;
  }

  static createNewAITrustCenterComplianceBadges(
    data: AITrustCenterComplianceBadgesModel,
  ): AITrustCenterComplianceBadgesModel {
    return new AITrustCenterComplianceBadgesModel(data);
  }
}
