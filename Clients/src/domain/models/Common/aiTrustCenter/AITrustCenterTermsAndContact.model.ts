export class AITrustCenterTermsAndContactModel {
  id?: number;
  terms_visible!: boolean;
  terms_text!: string;
  privacy_visible!: boolean;
  privacy_text!: string;
  email_visible!: boolean;
  email_text!: string;

  constructor(data: AITrustCenterTermsAndContactModel) {
    this.id = data.id;
    this.terms_visible = data.terms_visible;
    this.terms_text = data.terms_text;
    this.privacy_visible = data.privacy_visible;
    this.privacy_text = data.privacy_text;
    this.email_visible = data.email_visible;
    this.email_text = data.email_text;
  }

  static createNewAITrustCenterTermsAndContact(
    data: AITrustCenterTermsAndContactModel,
  ): AITrustCenterTermsAndContactModel {
    return new AITrustCenterTermsAndContactModel(data);
  }
}
