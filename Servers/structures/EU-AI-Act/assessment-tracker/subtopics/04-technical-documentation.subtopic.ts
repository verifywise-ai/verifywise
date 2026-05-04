export const TechnicalDocumentation = [
  {
    order_no: 1,
    title: "AI model capability assessment",
    questions: [
      {
        order_no: 1,
        question:
          "What is the source of the model being used? If it''s a pre-existing model, how was it selected? If it''s being developed in-house, what was the development process?",
        hint: "Detail your reasoning for choosing the high-risk AI system, referencing the AI provider’s documentation, or describe your involvement in any modifications or development processes.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The model we are using is pre-existing, sourced from a well-known AI provider specializing in computer vision. It was selected based on its proven accuracy, scalability, and the comprehensive documentation that aligns with our project objectives. There were no modifications to the model, but we have integrated it into our system with customized parameters to fit our use case.",
      },
      {
        order_no: 2,
        question:
          "What is your strategy for validating the model? How does this strategy ensure the model meets its intended purposes while minimizing unintended consequences?",
        hint: "Describe your organization''s validation processes for the AI system, emphasizing actions taken to mitigate risks in sensitive use cases.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our validation strategy includes rigorous testing using a variety of datasets to ensure the model performs well under different conditions. We conduct cross-validation to assess model stability and ensure that it meets our objectives. In sensitive use cases, we incorporate fairness and bias mitigation checks to minimize unintended consequences.",
      },
      {
        order_no: 3,
        question:
          "How is your organization documenting AI performance in the training environment? What metrics are being used, and how do they relate to the agreed objectives?",
        hint: "Outline your model evaluation process, including performance measures, model workflow, and updates based on project impact assessments.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "AI performance is documented through comprehensive logging during the training process, including metrics such as accuracy, precision, recall, and F1-score. These metrics are aligned with our agreed project objectives, specifically improving the model''s prediction accuracy while minimizing false positives. Regular updates are made based on performance evaluations after each training cycle.",
      },
    ],
  },
];
