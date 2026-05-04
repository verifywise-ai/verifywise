export class ISO27001SubClauseStructModel {
  id?: number;
  title!: string;
  order_no!: number;
  requirement_summary!: string;
  key_questions!: string[];
  evidence_examples!: string[];
  clause_id!: number;

  constructor(data: ISO27001SubClauseStructModel) {
    this.id = data.id;
    this.title = data.title;
    this.order_no = data.order_no;
    this.requirement_summary = data.requirement_summary;
    this.key_questions = data.key_questions;
    this.evidence_examples = data.evidence_examples;
    this.clause_id = data.clause_id;
  }

  static createNewISO27001SubClauseStruct(
    data: ISO27001SubClauseStructModel,
  ): ISO27001SubClauseStructModel {
    return new ISO27001SubClauseStructModel(data);
  }
}
