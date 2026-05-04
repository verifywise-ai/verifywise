export class SubClauseStructISO42001Model {
  id!: number;
  title!: string;
  order_no!: number;
  summary!: string;
  questions!: string[];
  evidence_examples!: string[];
  clause_id!: number;

  constructor(data: SubClauseStructISO42001Model) {
    this.id = data.id;
    this.title = data.title;
    this.order_no = data.order_no;
    this.summary = data.summary;
    this.questions = data.questions;
    this.evidence_examples = data.evidence_examples;
    this.clause_id = data.clause_id;
  }

  static createNewSubClauseStructISO42001(
    data: SubClauseStructISO42001Model,
  ): SubClauseStructISO42001Model {
    return new SubClauseStructISO42001Model(data);
  }
}
