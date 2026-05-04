export const TransparencyObligationsForProviders = [
  {
    order_no: 1,
    title: "User Notification of AI System Use",
    description:
      "Ensure clear communication that users are interacting with AI systems and provide comprehensive information about AI system functionalities and impacts.",
    implementation_details: "Implementation in progress with focus on user interface modifications",
    article: "Art. 50(1)",
    subControls: [
      {
        order_no: 1,
        title: "We design AI systems to clearly indicate user interaction with AI.",
        description:
          "Clear indicators help users understand when they are interacting with AI, promoting transparency and trust.",
        implementation_details:
          "Indicators will be displayed at key touchpoints of the user journey.",
        evidence_description: "Mockup of system interface with AI indicator is available.",
        feedback_description: "Awaiting user feedback on interface design.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Clear AI Indication for Users",
    description:
      "Ensure AI indications are clear and understandable for reasonably informed users.",
    implementation_details: "Planning phase - designing user communication strategy",
    article: "Art. 50(1)",
    subControls: [
      {
        order_no: 1,
        title: "We inform users when they are subject to AI system usage.",
        description:
          "Transparent communication ensures users are aware of and consent to AI system interactions affecting them.",
        implementation_details: "Notifications will be sent to users before AI interaction.",
        evidence_description: "Email template and pop-up notification scripts are prepared.",
        feedback_description: "Positive feedback from initial user testing.",
      },
      {
        order_no: 2,
        title:
          "We ensure AI indications are clear and understandable for reasonably informed users.",
        description:
          "Providing clear, simple AI indications allows users to make informed decisions and understand system limitations.",
        implementation_details: "AI indications will use simple language and accessible design.",
        evidence_description: "Preliminary design outlines available.",
        feedback_description: "No feedback yet.",
      },
    ],
  },
  {
    order_no: 3,
    title: "AI System Scope and Impact Definition",
    description: "Define and document AI system scope, goals, methods, and potential impacts.",
    implementation_details:
      "Comprehensive documentation helps align AI deployment with intended goals and prepares for potential risks.",
    article: "Art. 50(1)",
    subControls: [
      {
        order_no: 1,
        title: "We define and document AI system scope, goals, methods, and potential impacts.",
        description:
          "Comprehensive documentation helps align AI deployment with intended goals and prepares for potential risks.",
        implementation_details:
          "System documentation is being drafted, with input from cross-functional teams.",
        evidence_description: "Draft document available for review.",
        feedback_description: "Feedback from technical team is being incorporated.",
      },
    ],
  },
  {
    order_no: 4,
    title: "AI System Scope and Impact Definition",
    description:
      "Maintain accurate records of AI system activities, including modifications and third-party involvements.",
    implementation_details:
      "Accurate records ensure accountability and support audits, troubleshooting, and regulatory compliance.",
    article: "Art. 50(1)",
    subControls: [
      {
        order_no: 1,
        title:
          "We maintain accurate records of AI system activities, modifications, and third-party involvements.",
        description:
          "Accurate records ensure accountability and support audits, troubleshooting, and regulatory compliance.",
        implementation_details: "Records are stored in a secure, centralized repository.",
        evidence_description: "System log files and change history available.",
        feedback_description: "Audit passed with no issues.",
      },
    ],
  },
  {
    order_no: 5,
    title:
      "Inform natural persons exposed to an emotion recognition system or a biometric categorization system about its operation.",
    description:
      "Emotion recognition and biometric categorization disclosure obligation (Art 50.2).",
    article: "Art. 50(2)",
    subControls: [
      {
        order_no: 1,
        title:
          "We inform individuals that they are being exposed to an emotion recognition system, and provide information about the categories of data processed (biometric data type, purpose, storage duration).",
        description:
          "Disclosure notices covering system purpose, biometric data category, and storage duration.",
      },
      {
        order_no: 2,
        title:
          "Where applicable, we comply with GDPR requirements for processing biometric and special category data.",
        description:
          "GDPR Art 9 legal basis, safeguards, and records maintained for biometric/special-category processing.",
      },
    ],
  },
  {
    order_no: 6,
    title:
      "Label AI-generated or manipulated image, audio, or video content that constitutes a deep fake.",
    description:
      "Deep fake labeling obligation with machine-readable marking where feasible (Art 50.3).",
    article: "Art. 50(3)",
    subControls: [
      {
        order_no: 1,
        title:
          "All AI-generated or substantially manipulated image, audio, and video content is clearly and prominently labeled as artificially generated or manipulated.",
        description:
          "Visible, prominent labeling applied to AI-generated or substantially manipulated media.",
      },
      {
        order_no: 2,
        title:
          "The labeling is machine-readable where technically feasible, using standardized metadata or watermarking.",
        description:
          "Machine-readable provenance metadata (e.g. C2PA) or watermarking applied where technically feasible.",
      },
      {
        order_no: 3,
        title:
          "An exception applies only where the content is part of a manifestly artistic, creative, satirical, or fictional work, and does not affect the obligation to label for downstream recipients.",
        description:
          "Exception scope documented and not permitted to suppress downstream disclosure obligations.",
      },
    ],
  },
  {
    order_no: 7,
    title: "Label AI-generated text published to inform the public on matters of public interest.",
    description:
      "AI-generated text disclosure when publishing on matters of public interest (Art 50.4).",
    article: "Art. 50(4)",
    subControls: [
      {
        order_no: 1,
        title:
          "AI-generated text that is published for the purpose of informing the public on matters of public interest is labeled as artificially generated, unless it has undergone human review and editorial control and a natural person holds editorial responsibility.",
        description:
          "Editorial workflow either labels AI-generated text or records the named natural person holding editorial responsibility.",
      },
    ],
  },
];
