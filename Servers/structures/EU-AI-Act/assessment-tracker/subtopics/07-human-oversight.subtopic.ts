export const HumanOversight = [
  {
    order_no: 1,
    title: "Oversight documentation",
    questions: [
      {
        order_no: 1,
        question:
          "How is the supervision of the AI system designed to ensure human oversight wherever the AI solution could take or influence key decisions?",
        hint: "Describe the human oversight mechanisms in place to ensure key decisions made by the AI system are appropriately monitored.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The AI system includes a supervisory framework where human operators continuously monitor and review key decisions. Alerts are triggered for any critical decision-making processes, ensuring that human intervention is available if necessary. Additionally, there are manual review checkpoints to ensure decisions made by the AI are aligned with company policies and ethical standards.",
      },
      {
        order_no: 2,
        question:
          "How is the effectiveness of human oversight ensured, including having sufficient knowledge to interpret the system’s outputs, understand automation bias, and mitigate fundamental risks?",
        hint: "Explain strategies to ensure human oversight is effective, including sufficient knowledge of system outputs, understanding automation bias, and mitigating risks.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Effectiveness is ensured through a combination of specialized training for human overseers, continuous system testing for automation bias, and regular risk mitigation workshops. Oversight personnel are trained in understanding AI-generated outputs and are equipped with the knowledge to identify and address potential risks posed by automation.",
      },
      {
        order_no: 3,
        question:
          "What is your organization''s strategy for conducting periodic reviews of the AI application with regard to ethical values? Who will be involved in these reviews?",
        hint: "Detail your strategy for conducting periodic conformity reviews of the AI system and identify the roles involved in these reviews.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The organization conducts bi-annual ethical reviews led by a dedicated ethics committee comprising AI experts, legal advisors, and external consultants. These reviews assess the AI application’s compliance with ethical principles, focusing on fairness, transparency, and accountability, and adjusting practices as necessary.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Human intervention mechanisms",
    questions: [
      {
        order_no: 1,
        question:
          "How is human oversight empowered to stop or alter the AI system''s operations, ensuring the ability to intervene throughout its lifecycle and mitigate fundamental rights risks?",
        hint: "Describe how human oversight is empowered to intervene, stop, or alter AI system operations, ensuring control throughout the lifecycle.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Human oversight is empowered through a real-time control dashboard, allowing authorized personnel to halt or adjust system operations at any time. Additionally, a set of predetermined intervention triggers ensures that human operators can intervene whenever fundamental rights risks are detected, such as biases or system errors.",
      },
      {
        order_no: 2,
        question:
          "To what extent is human deliberation replaced by automated systems in this AI application?",
        hint: "Explain the extent to which human decision-making is replaced by automated systems and the safeguards in place.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Human deliberation is minimized in tasks where AI has proven high accuracy, such as data analysis and pattern recognition. However, human judgment is always involved in final decision-making for high-impact or ethical considerations, with a safeguard that allows human operators to review or override automated decisions.",
      },
    ],
  },
];
