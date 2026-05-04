export const RiskManagementSystem = [
  {
    order_no: 1,
    title: "Transparency and provision of information to deployers",
    questions: [
      {
        order_no: 1,
        question:
          "Will you make substantial modifications to the high-risk AI system already on the EU market, and if so, what additional training or fine-tuning will be performed on the model after these modifications?",
        hint: "As a deployer, you are responsible for any additional changes made to the high-risk AI system and must fulfill additional requirements based on the data used and the specific use case you are deploying.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, substantial modifications will be made to the high-risk AI system. Specifically, additional fine-tuning will be performed on the natural language processing models to improve contextual understanding. This will involve retraining the model with newly collected domain-specific data to enhance its accuracy and robustness in specific use cases.",
      },
      {
        order_no: 2,
        question:
          "What business problem does the AI system solve, and what are its capabilities? What other techniques were considered before deciding to use AI to address this problem?",
        hint: "It''s important to provide transparent information about why you are choosing a high-risk AI system, including a mapping of key stages within the project and an assessment of resources and capabilities within your team or organization.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The AI system is designed to solve the problem of automating customer support interactions for a large-scale e-commerce platform. It leverages natural language understanding (NLU) to efficiently respond to customer queries, reducing human workload and response time. Before deciding on AI, we also considered rule-based automation systems, but AI provided a more scalable and adaptable solution.",
      },
      {
        order_no: 3,
        question:
          "How has your organization assessed the AI application against its ethical values? What ethical considerations were most pertinent, and how were they addressed?",
        hint: "Explain what other methods lacked and, based on the use case, what the implications would be for society, the environment, and human rights.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization conducted a thorough ethical review of the AI application, focusing on transparency, fairness, and privacy concerns. Key ethical considerations included ensuring that the AI did not perpetuate biases or discriminate against certain groups. We implemented bias mitigation strategies and ensured data privacy compliance through strong encryption and anonymization techniques.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Responsibilities along the AI value chain",
    questions: [
      {
        order_no: 1,
        question:
          "Specify details of any third-party involvement in the design, development, deployment, and support of the AI system.",
        hint: "Ensure you map out all high-risk AI system providers and other parties involved in the AI lifecycle. If personal information is used by the high-risk AI system, conduct a privacy impact assessment to mitigate privacy threats. Request documentation from the provider to start addressing this.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We worked with an external AI development firm that specialized in NLP for automating customer support. They were involved in the initial design, model training, and deployment phases. Privacy impact assessments were conducted in collaboration with legal teams to ensure compliance with GDPR guidelines, and the firm provided documentation confirming their data handling practices.",
      },
      {
        order_no: 2,
        question:
          "What risks were identified in the data impact assessment? How have these risks been addressed or mitigated?",
        hint: "Make sure perosnal infomration is used by the high risk AI system, we need to conduct a privacy impact assessment to make sure privacy threats are mitigated ask for this from the provider to start thinking about it",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The primary risk identified was the potential for personal data leakage through model outputs. To mitigate this, we implemented strict access controls to the model, as well as automatic data anonymization processes during training. We also conducted a thorough audit of third-party data sources to ensure compliance with privacy regulations.",
      },
      {
        order_no: 3,
        question:
          "How has the selection or development of the model been assessed with regard to fairness, explainability, and robustness? What specific risks were identified in this assessment?",
        hint: "Responsible AI principles should be evulauated on your high risk system indivaually, and make sure your high risk ai provider has an effective AI governance mechanism to continously test and validate metrics regarding to fairness explianavbility and robostnuss of theirn high risk system",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We assessed the model using fairness audits, explainability techniques (such as SHAP values), and robustness testing to ensure that it performed consistently across diverse data sources. Specific risks identified included the potential for unbalanced training data leading to biased outputs. We mitigated these risks by using diverse and representative datasets during training and regularly testing the model for fairness.",
      },
      {
        order_no: 4,
        question:
          "What strategies have been implemented to address the risks identified in the model assessment? How effective have these strategies been?",
        hint: "Provide a breakdown of the risk mitigation strategies identified during due diligence and how your contractual and organizational measures were implemented.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "To address risks identified in the model assessment, we implemented a series of mitigation strategies, including the integration of fairness algorithms, continuous model monitoring, and regular retraining with updated data. These strategies have proven effective in maintaining model fairness and robustness. Additionally, we have established regular review meetings with our AI governance team to monitor the impact and adjust strategies as needed.",
      },
    ],
  },
];
