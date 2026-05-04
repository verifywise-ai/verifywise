export const ProjectScope = [
  {
    order_no: 1,
    title: "General",
    questions: [
      {
        order_no: 1,
        question: "Describe the AI environment/application used.",
        hint: "Provide details about the infrastructure, platform, and primary use cases of your AI system. Include information about the deployment environment (cloud/on-premise), main functionalities, and target users.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The AI environment involves a cloud-based platform for hosting machine learning models and managing large-scale data processing. The application is primarily focused on natural language processing (NLP) and computer vision tasks, utilizing deep learning algorithms for model training and inference.",
      },
      {
        order_no: 2,
        question: "Is a new form of AI technology used?",
        hint: "Indicate whether you're using emerging or experimental AI technologies. Consider novel algorithms, cutting-edge architectures, or recent developments not yet widely adopted in the industry.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, we are utilizing a hybrid form of AI that combines reinforcement learning with traditional supervised learning techniques. This allows the system to continuously adapt to changing environments and improve its performance over time.",
      },
      {
        order_no: 3,
        question: "Are personal sensitive data used?",
        hint: "Specify if the system processes personal data as defined by GDPR (e.g., health data, biometric data, financial information, location data). Describe any data anonymization or pseudonymization measures if applicable.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "No, the system does not process personal sensitive data. All input data is anonymized and stripped of personally identifiable information (PII) before being used in the model training process.",
      },
      {
        order_no: 4,
        question: "Project scope documents description",
        hint: "Summarize the key project documentation including objectives, deliverables, boundaries, and constraints. Reference any formal project charter, requirements documents, or scope statements.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The project scope includes the development of a recommendation engine for e-commerce platforms, which will leverage AI technologies to enhance product recommendations based on user behavior. The system will be designed for scalability and deployed on a cloud infrastructure.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Technology details",
    questions: [
      {
        order_no: 1,
        question: "What type of AI technology are you using? Explain AI and ML technologies used.",
        hint: "Detail the specific AI/ML techniques employed (e.g., deep learning, NLP, computer vision, reinforcement learning). Include model architectures, frameworks, and key algorithms used in your system.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We are using deep learning, specifically convolutional neural networks (CNNs) for image classification tasks, and transformer-based models for natural language processing (NLP). Additionally, reinforcement learning algorithms are employed for optimizing decision-making processes in real-time applications.",
      },
      {
        order_no: 2,
        question:
          "Is there ongoing monitoring of the system to ensure that the system is operating as intended?",
        hint: "Describe monitoring mechanisms including performance metrics tracked, alerting thresholds, logging practices, and frequency of reviews. Include tools and dashboards used for observability.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, we have implemented continuous monitoring of the system through real-time analytics dashboards, which track model performance, latency, and accuracy. Alerts are configured to notify the team if performance drops below a defined threshold, ensuring that the system operates as intended.",
      },
      {
        order_no: 3,
        question:
          "Have you considered unintended outcomes that could occur from the use of this system?",
        hint: "Document potential risks such as algorithmic bias, misuse scenarios, edge cases, and failure modes. Explain mitigation strategies and safeguards implemented to address these concerns.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, we have conducted thorough risk assessments to identify potential unintended consequences, such as algorithmic bias or inaccurate predictions. To mitigate these risks, we have implemented fairness checks, regular model retraining, and extensive validation against diverse datasets.",
      },
      {
        order_no: 4,
        question:
          "Add technology documentation. You can include a data flow diagram, MLops lifecycle diagram. Think of it as an executive summary of the technology you are using.",
        hint: "Upload or describe technical documentation including system architecture diagrams, data flow diagrams, API specifications, and MLOps pipeline documentation. Provide an executive-level overview of your technology stack.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The technology documentation outlines the architecture of the AI system, including data preprocessing pipelines, model training, and deployment stages. A data flow diagram visualizes the movement of data across the system, while the MLops lifecycle diagram shows the continuous integration and deployment (CI/CD) process for model updates.",
      },
    ],
  },
];
