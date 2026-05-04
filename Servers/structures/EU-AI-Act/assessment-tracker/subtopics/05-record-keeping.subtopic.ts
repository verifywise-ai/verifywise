export const RecordKeeping = [
  {
    order_no: 1,
    title: "AI model capability assessment",
    questions: [
      {
        order_no: 1,
        question:
          "What performance criteria have been established for the AI application? How were these criteria determined, and how do they relate to the application''s objectives?",
        hint: "Explain how performance criteria were determined for the AI system and how they align with the application''s objectives.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The performance criteria for the AI application were established based on accuracy, latency, and scalability. These criteria were determined through a series of benchmarks and tests performed on the models in real-world conditions. The criteria align with the application’s objectives by ensuring that the AI can perform in diverse environments, while also meeting latency requirements for real-time operations and scalability for large data sets.",
      },
      {
        order_no: 2,
        question:
          "Describe the policies and procedures in place for retaining automatically generated logs for a minimum of six months to ensure adequate data tracking and auditability.",
        hint: "Describe policies and procedures for retaining logs for a minimum of six months to ensure data tracking and auditability.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The policies and procedures for retaining logs are designed to ensure compliance with audit and regulatory requirements. All automatically generated logs are securely stored in a cloud-based logging service for a minimum of six months. Regular backups are taken, and access controls are implemented to protect the integrity of the logs. Retention policies are reviewed annually to ensure they meet legal and operational requirements.",
      },
      {
        order_no: 3,
        question:
          "How has your organization tested the model''s performance on extreme values and protected attributes? What were the results of these tests, and how have they informed further development?",
        hint: "Detail your organization''s tests on extreme values and protected attributes, their results, and how these informed further development.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The model was tested on extreme values and protected attributes using a series of edge-case scenarios and adversarial tests. These tests revealed that while the model performed well on standard inputs, its performance degraded on extreme or rare cases, particularly with protected attributes such as age and gender. These results have informed further model refinement, including improved pre-processing techniques and bias mitigation strategies.",
      },
      {
        order_no: 4,
        question:
          "What patterns of failure have been identified in the model? How were these patterns discovered, and what do they reveal about the model''s limitations?",
        hint: "Desribe the identified failure patterns in the model, how they were discovered, and what they reveal about the system''s limitations.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Failure patterns were identified through rigorous testing of the model under diverse conditions, including variations in input data and environmental factors. These patterns showed that the model struggled with certain language dialects and uncommon data types, revealing its limitations in generalization. Further research has been initiated to address these shortcomings by introducing a more diverse training dataset and improving model robustness to various input scenarios.",
      },
    ],
  },
];
