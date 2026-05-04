export const EnvironmentalImpact = [
  {
    order_no: 1,
    title: "Environmental impact",
    questions: [
      {
        order_no: 1,
        question:
          "How has your organization assessed the overall environmental impact of this AI application? What factors were considered in this assessment?",
        hint: "Summarize your environmental impact assessment, including the AI provider’s sustainability practices and your organization’s efforts to mitigate negative impacts.",
        priority_level: "low priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization conducted an environmental impact assessment by reviewing the energy consumption of the AI models during training and inference, as well as the carbon footprint of the data centers. We also evaluated the AI provider''s sustainability practices, including their use of renewable energy and efforts to minimize waste through efficient hardware usage.",
      },
      {
        order_no: 2,
        question:
          "What are the environmental effects of the AI application? How are these effects measured and mitigated?",
        hint: "Describe the environmental effects of the AI system and how these are measured and mitigated through your and the provider’s practices.",
        priority_level: "low priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The AI application has a noticeable environmental effect primarily due to its energy consumption during model training and inference. The carbon footprint is measured through tracking the power usage of the data centers and the carbon intensity of the electricity grid. To mitigate these effects, we prioritize the use of AI providers who use renewable energy and implement energy-efficient hardware solutions.",
      },
    ],
  },
];
