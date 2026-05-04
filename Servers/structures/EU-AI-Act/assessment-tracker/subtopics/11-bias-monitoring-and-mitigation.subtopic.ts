export const BiasMonitoringAndMitigation = [
  {
    order_no: 1,
    title: "Bias and fairness evaluation",
    questions: [
      {
        order_no: 1,
        question:
          "What measures have been undertaken to address bias in the AI system''s training data, and what guardrails are in place to ensure non-discriminatory responses?",
        hint: "Explain how bias in training data is addressed and the guardrails in place to ensure non-discriminatory responses.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "To address bias in the AI system''s training data, we utilize a multi-step process including data balancing, preprocessing techniques, and fairness-aware algorithms. We also implement guardrails such as continuous monitoring of model predictions, testing for potential biases in decision-making, and regular audits by diverse teams to ensure non-discriminatory responses.",
      },
      {
        order_no: 2,
        question:
          "Are there specific groups that are favored or disadvantaged in the context where the AI application is used? How has this been assessed and addressed?",
        hint: "Detail how specific groups are assessed for bias in the AI application and the corrective actions taken.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We conduct regular bias audits to assess whether specific groups are favored or disadvantaged by the AI application. These audits involve analyzing the impact of the AI system on different demographic groups and ensuring fairness in model predictions. In case of disparities, we take corrective actions such as rebalancing the training dataset, modifying algorithms, or adding fairness constraints.",
      },
      {
        order_no: 3,
        question:
          "Is your user base comprised of individuals or groups from vulnerable populations? If so, what special considerations or protections have been put in place?",
        hint: "Describe any special considerations or protections for vulnerable populations within your user base.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our user base includes individuals from vulnerable populations, particularly in healthcare and financial sectors. We have implemented special considerations, including ensuring that data privacy and security are prioritized, providing accessible support channels, and incorporating safeguards in the AI models to prevent discriminatory practices. Additionally, we ensure that all AI interactions are transparent and understandable to users.",
      },
    ],
  },
];
