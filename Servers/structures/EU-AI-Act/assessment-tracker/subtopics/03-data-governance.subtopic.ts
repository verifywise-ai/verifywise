export const DataGovernance = [
  {
    order_no: 1,
    title: "Responsibilities along the AI value chain",
    questions: [
      {
        order_no: 1,
        question:
          "What risks have been identified associated with the chosen deployment and serving strategies? How have these risks been prioritized?",
        hint: "Give a break down of the risk mitigation strategies that you have detected in the due dilgience proess and how your contractual and organziational masures were implemented",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The identified risks include system downtime due to unplanned maintenance, data breaches during data transfer, and failure to comply with regulatory standards in the deployment region. These risks were prioritized based on their potential impact on the users and the business. Mitigation strategies include maintaining redundant infrastructure, employing encryption protocols for data transfer, and aligning deployment strategies with local regulations and compliance frameworks.",
      },
      {
        order_no: 2,
        question:
          "What measures are in place to detect undesired behavior in our AI solution, including logging and responding to such behavior?",
        hint: "Describe your efforts around continuous monitoring for AI safety risks, with robust logging mechanisms that enable accountable implementation practices throughout the AI lifecycle.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We have implemented continuous monitoring mechanisms to detect undesired behaviors such as bias, errors, or security breaches. Real-time logging allows us to track the model''s actions and performance across various stages, from development to deployment. Automated alerts trigger responses to any irregularities or negative outcomes. Additionally, we conduct regular audits to ensure ongoing safety and transparency.",
      },
      {
        order_no: 3,
        question:
          "How can any unforeseen effects be mitigated after deployment of the AI application?",
        hint: "Make sure that proactively conceptualize and start risk mitigation before depoyment, and after deploying the high risk ain system your organization and the AI provier monitor for new risks ",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "To mitigate unforeseen effects after deployment, we have set up continuous post-deployment monitoring and feedback systems. These include performance analysis tools, user feedback collection, and rapid incident response protocols. In addition, our collaboration with the AI provider ensures that any new risks identified can be promptly addressed by updating the system or re-training models as necessary.",
      },
      {
        order_no: 4,
        question:
          "What is the possible harmful effect of uncertainty and error margins for different groups? How is this being addressed?",
        hint: "Describe how your organization proactively conceptualize risk mitigation strategies before deployment and after deployment to collaborate with the AI provider to monitor for emerging risks.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The uncertainty and error margins in AI applications can result in unfair outcomes, especially for underrepresented or vulnerable groups. To address this, we perform thorough testing on diverse datasets to minimize biases. Post-deployment, we continuously assess model performance to ensure that no group faces disproportionate negative impacts. We also collaborate with the AI provider to incorporate fairness audits and make model adjustments when necessary.",
      },
      {
        order_no: 5,
        question:
          "What mechanisms are in place for reporting serious incidents and certain risks to both the relevant authorities and other stakeholders?",
        hint: "Describe the contractual commitments and incident management obligations of both the AI provider and your organization, detailing responsibilities for reporting incidents.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We have established clear incident reporting mechanisms outlined in our contractual agreements with the AI provider. These protocols include notifying relevant authorities and stakeholders immediately following any serious incidents. The AI provider is obligated to report any system failures or security breaches, and our organization has dedicated personnel for managing the communication and escalation process.",
      },
      {
        order_no: 6,
        question:
          "What risks have been identified associated with potentially decommissioning the AI system? How might these risks impact users, the organization, or other stakeholders?",
        hint: "Describe your decommissioning process for the high-risk AI system, considering issues with training data, model repositories, and the sensitivity of the use case, such as data types and availability.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Decommissioning the AI system may lead to risks such as loss of data access, unavailability of model insights, or disruption to users dependent on the system. To mitigate these risks, we have devised a comprehensive decommissioning plan that ensures data is securely archived, models are backed up, and users are informed well in advance. The plan also accounts for regulatory compliance regarding data retention and model dismantling.",
      },
      {
        order_no: 7,
        question:
          "What data sources are being used to develop the AI application? Describe the input and output data, and explain how this data is documented and managed.",
        hint: "Explain the origins of the training dataset, its attributes, data types, categories, IP rights, and volume. Include metadata and data collection processes, such as web scraping or surveys. Detail the IP rights of the datasets, demonstrating lawful use of training data.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our AI application uses multiple data sources, including publicly available datasets, proprietary datasets, and data collected via web scraping and surveys. The input data primarily consists of text, images, and sensor data, while output data is predictions or classifications derived from these inputs. We ensure that all data sources are well documented, with metadata capturing information on data types, categories, IP rights, and volume. We have legal agreements in place to ensure lawful use of data.",
      },
      {
        order_no: 8,
        question:
          "Does the repository track and manage intellectual property rights and restrictions on the use of its content as required by deposit agreements, contracts, or licenses?",
        hint: "Describe your findings on data quality, completeness, and balance, using the provider''s documentation as a starting point. Discuss issues such as missing data, outliers, and unbalanced classes.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, the repository maintains detailed records of intellectual property rights and usage restrictions. Each dataset is tagged with its respective licenses and usage terms, ensuring compliance with deposit agreements. We also monitor data quality and completeness, with particular attention to missing data, outliers, and any imbalances in the dataset, which is documented for future reference.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Fundamental rights impact assessments for high-risk AI systems",
    questions: [
      {
        order_no: 1,
        question:
          "How has your organization ensured the representativeness, relevance, accuracy, traceability, and completeness of the data used in development? What challenges were encountered in this process?",
        hint: "Explain the origins of the training dataset, its attributes, data types, categories, IP rights, and volume. Include metadata and data collection processes, such as web scraping or surveys. Detail the IP rights of the datasets, demonstrating lawful use of training data.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization ensures data representativeness by sourcing data from diverse geographical regions and demographic groups. The data is thoroughly reviewed for accuracy by domain experts, and metadata, such as collection methods and volume, is consistently maintained. Challenges include inconsistent data formats and incomplete metadata for some datasets.",
      },
      {
        order_no: 2,
        question:
          "Provide details of the confidential and sensitive data processed by the AI system. Does it handle personal data?",
        hint: "Detail the datasets processed, specifying the sensitive and personal data involved, how they are collected, and the purposes of processing.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, our AI system processes personal data, including demographic details and behavioral data collected through user interactions. This data is processed for personalizing content and improving user experience. All data is anonymized where necessary to maintain privacy.",
      },
      {
        order_no: 3,
        question:
          "What are the legal bases for processing personal and sensitive data? What measures are in place to ensure that the processing logic remains consistent with the original purpose for which consent was obtained, and that data is deleted after the stipulated period?",
        hint: "Detail the datasets processed, specifying the sensitive and personal data involved, how they are collected, and the purposes of processing.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our legal bases for processing personal and sensitive data include obtaining explicit consent from users and processing data for the performance of contractual obligations. Measures are in place to regularly audit data usage to ensure compliance with the original consent and to ensure that data is deleted within the agreed retention periods.",
      },
      {
        order_no: 4,
        question:
          "Describe the measures in place to ensure that the AI system does not leak private or sensitive data, especially in the context of adversarial attacks.",
        hint: "Detail the AI provider''s safety frameworks and add any organizational measures implemented to prevent data leaks.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We implement advanced encryption techniques both at rest and during transmission to ensure sensitive data is protected. Additionally, we regularly conduct vulnerability assessments and adversarial attack simulations to identify and mitigate any weaknesses in our system.",
      },
      {
        order_no: 5,
        question:
          "How has legal compliance with respect to data protection (e.g., GDPR) been assessed and ensured? What protected attributes have been identified and how are they handled?",
        hint: "Summarize your privacy impact assessment to demonstrate legal compliance with GDPR and provide links to supporting documents.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "We have conducted a comprehensive privacy impact assessment (PIA) to ensure compliance with GDPR. Key protected attributes include personal identification data, location data, and biometric data. We ensure that all protected attributes are handled with explicit consent and that data is anonymized or pseudonymized where appropriate.",
      },
      {
        order_no: 6,
        question:
          "Provide details of the measures in place to comply with data subject requests, including those related to access, objection, deletion, and other rights.",
        hint: "Describe the high-risk AI system’s mechanisms for handling data subject requests, such as access, objection, and deletion, ensuring compliance within a 30-day timeframe.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our organization has implemented a robust system to manage data subject rights requests. This includes automated workflows to ensure that all requests for access, objection, and deletion are processed within the 30-day timeframe. We also maintain an audit trail to track the status of each request.",
      },
      {
        order_no: 7,
        question:
          "Has the organization determined how the privacy of those involved is protected? What specific measures are in place?",
        hint: "Describe the privacy risks and how they are mitigated through organizational and technical measures, complementing the AI provider''s safeguards.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, our organization has developed a comprehensive privacy policy that includes risk assessments and mitigation strategies. These strategies include encryption of personal data, user consent management, and regular security audits to ensure that the privacy of individuals is protected.",
      },
      {
        order_no: 8,
        question:
          "Can the user delete their data from the system? If so, how, and if not, why not?",
        hint: "Explain how the right to deletion is exercised by end users interacting with the AI system across your organization’s systems, the AI provider’s systems, and other lifecycle actors.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Yes, users have the right to delete their data from the system. They can initiate the process by contacting our data management team or through the platform’s interface. Upon request, data is anonymized or deleted in compliance with our data retention policy.",
      },
    ],
  },
];
