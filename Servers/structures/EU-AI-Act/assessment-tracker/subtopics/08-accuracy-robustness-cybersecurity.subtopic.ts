export const AccuracyRobustnessCyberSecurity = [
  {
    order_no: 1,
    title: "System validation and reliability documentation",
    questions: [
      {
        order_no: 1,
        question:
          "What is your strategy for testing the model? How does this strategy differ from the validation strategy, and why?",
        hint: "Explain how your model testing strategy differs from validation and why this approach is necessary.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The model testing strategy involves a thorough evaluation of the model using unseen data that simulates real-world scenarios, which helps to assess the generalization ability of the model. Unlike validation, which is done during the training phase to optimize hyperparameters, testing occurs post-training to evaluate the final performance. This strategy ensures that the model will work as expected when deployed in the production environment.",
      },
      {
        order_no: 2,
        question:
          "How will the AI system be served to end-users? What considerations have been made to ensure accessibility, reliability, and security?",
        hint: "Describe considerations for serving the AI system to end users, focusing on accessibility, reliability, and security.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The AI system will be served to end-users via a cloud-based API, enabling seamless access from multiple devices and platforms. To ensure accessibility, the system will comply with web accessibility standards (WCAG). For reliability, the architecture will include load balancing, failover mechanisms, and redundancy. Security measures include end-to-end encryption, regular security audits, and user authentication to prevent unauthorized access.",
      },
    ],
  },
  {
    order_no: 2,
    title: "AI system change documentation",
    questions: [
      {
        order_no: 1,
        question:
          "What monitoring systems will be in place to track the AI system''s performance in the production environment? How will this data be used to maintain or improve the system?",
        hint: "Detail the monitoring systems in place to track performance in production and how this data is used to maintain or improve the AI system.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "To track the AI system’s performance in production, we will implement real-time monitoring using tools like Prometheus and Grafana. These systems will monitor key metrics such as response time, accuracy, and system resource utilization. Data gathered will be analyzed to detect performance degradation or issues, allowing us to proactively tune the model or retrain it with updated data to maintain optimal performance.",
      },
      {
        order_no: 2,
        question:
          "Are the details of the cloud provider and secure deployment architecture clearly defined, and what specific measures have been taken to address AI system security risks, including jailbreaks, and adversarial attacks?",
        hint: "Describe the security measures taken for the AI system, including secure deployment, protection against jailbreaks, and adversarial attacks.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, we have selected AWS as the cloud provider and defined a secure deployment architecture that utilizes private virtual networks, secure APIs, and encrypted data storage. To address AI system security risks, we employ techniques like adversarial training to protect against adversarial attacks and regularly update security protocols to mitigate jailbreak vulnerabilities. We also monitor system integrity to detect and prevent unauthorized access or manipulation of the AI models.",
      },
      {
        order_no: 3,
        question:
          "How will your organization detect and address risks associated with changing data quality, potential data drift, and model decay? What thresholds have been set to trigger intervention?",
        hint: "Explain how your organization monitors data quality, potential data drift, and model decay, including thresholds for intervention.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization employs continuous data monitoring tools that track the quality of incoming data and compare it against expected patterns. We have set thresholds for data drift, such as a 10% shift in feature distributions, to trigger alerts for intervention. For model decay, we perform periodic evaluations of model performance against new data, and if accuracy drops by more than 5%, we initiate retraining with updated datasets to maintain model relevance and accuracy.",
      },
    ],
  },
];
