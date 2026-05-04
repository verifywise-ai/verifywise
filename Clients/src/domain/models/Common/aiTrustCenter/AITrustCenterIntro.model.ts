export class AITrustCenterIntroModel {
  id?: number;
  purpose_visible!: boolean;
  purpose_text!: string;
  our_statement_visible!: boolean;
  our_statement_text!: string;
  our_mission_visible!: boolean;
  our_mission_text!: string;

  constructor(data: AITrustCenterIntroModel) {
    this.id = data.id;
    this.purpose_visible = data.purpose_visible;
    this.purpose_text = data.purpose_text;
    this.our_statement_visible = data.our_statement_visible;
    this.our_statement_text = data.our_statement_text;
    this.our_mission_visible = data.our_mission_visible;
    this.our_mission_text = data.our_mission_text;
  }

  static createNewAITrustCenterIntro(data: AITrustCenterIntroModel): AITrustCenterIntroModel {
    return new AITrustCenterIntroModel(data);
  }
}
