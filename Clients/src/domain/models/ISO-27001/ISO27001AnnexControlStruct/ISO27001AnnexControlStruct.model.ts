export class ISO27001AnnexControlStructModel {
  id?: number;
  title!: string;
  order_no!: number;
  requirement_summary!: string;
  key_questions!: string[];
  evidence_examples!: string[];
  annex_id!: number;

  constructor(data: ISO27001AnnexControlStructModel) {
    this.id = data.id;
    this.title = data.title;
    this.order_no = data.order_no;
    this.requirement_summary = data.requirement_summary;
    this.key_questions = data.key_questions;
    this.evidence_examples = data.evidence_examples;
    this.annex_id = data.annex_id;
  }

  static createNewISO27001AnnexControlStruct(
    data: ISO27001AnnexControlStructModel,
  ): ISO27001AnnexControlStructModel {
    return new ISO27001AnnexControlStructModel(data);
  }
}
