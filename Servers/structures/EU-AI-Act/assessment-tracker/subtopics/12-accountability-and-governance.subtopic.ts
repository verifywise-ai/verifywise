export const AccountabilityAndGovernance = [
  {
    order_no: 1,
    title: "System information documentation",
    questions: [
      {
        order_no: 1,
        question:
          "Who in your organization is responsible for ensuring and demonstrating that AI systems adhere to defined organizational values? How is this responsibility carried out?",
        hint: "Explain the roles and responsibilities for ensuring AI adherence to organizational values and how this responsibility is executed.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The responsibility for ensuring AI systems adhere to organizational values lies with the Chief AI Officer (CAIO) and the ethics committee. The CAIO oversees the development of AI strategies and policies, ensuring they align with company values. The ethics committee reviews the AI system''s deployment and ensures ethical considerations are embedded in every stage of the development cycle. This responsibility is carried out by regular audits, transparency reports, and stakeholder consultations.",
      },
      {
        order_no: 2,
        question:
          "Are the inputs and outputs of the AI system logged, and what is the frequency of feedback and review? How long would it take to respond to and address any undesired behavior?",
        hint: "Describe the logging mechanisms for AI system inputs and outputs, including frequency of feedback and response time for undesired behavior.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, all inputs and outputs of the AI system are logged continuously in real-time. This includes both raw data and processed outputs. We review the logs on a weekly basis, and we also have an automated alert system that flags any irregularities. If any undesired behavior is detected, a response is triggered within 24 hours, and corrective actions are taken to address the issue, including model retraining if necessary.",
      },
      {
        order_no: 3,
        question:
          "To what extent does the deployment of AI influence legal certainty and civil liberties? Is this influence clear to end users, stakeholders, and (popular) representatives?",
        hint: "Explain the impact of AI deployment on legal certainty and civil liberties, and how this is communicated to users and stakeholders.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The deployment of AI systems can have significant implications on legal certainty and civil liberties, particularly when it comes to privacy, accountability, and discrimination. Our organization takes great care to ensure that AI deployment complies with relevant laws and regulations. The impact is clearly communicated to end users, stakeholders, and representatives through transparency reports and public disclosures. We also hold regular consultations with legal experts and civil liberties groups to address potential concerns and ensure that the deployment aligns with ethical standards.",
      },
      {
        order_no: 4,
        question:
          "What strategies has your organization developed to address the risks associated with decommissioning the AI system? How will data residuals, model accessibility, and interfaces to other systems be handled?",
        hint: "Detail strategies for decommissioning the AI system, including handling data residuals, model accessibility, and system interfaces.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization has developed a comprehensive strategy for decommissioning AI systems, which includes the secure deletion of data residuals in compliance with data protection regulations. Models and algorithms are archived in a secure repository for future reference or possible retraining, ensuring that intellectual property is safeguarded. Additionally, we work with relevant teams to ensure that all interfaces with other systems are properly closed off to prevent any data leakage or unintended consequences during decommissioning. We also conduct post-decommissioning audits to ensure complete removal and security.",
      },
    ],
  },
];
