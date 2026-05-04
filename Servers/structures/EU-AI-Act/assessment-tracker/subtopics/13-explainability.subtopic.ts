export const Explainability = [
  {
    order_no: 1,
    title: "Transparency obligations for providers and users of certain AI systems",
    questions: [
      {
        order_no: 1,
        question:
          "What are the primary objectives of your AI application? How do these objectives align with your organization''s overall mission and values?",
        hint: "Explain how the AI system’s objectives align with your organization’s mission and values, emphasizing clarity and accessibility.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The primary objectives of our AI application are to enhance customer experience through personalized recommendations and automate data-driven decision-making to improve operational efficiency. These objectives align with our organization’s mission to use cutting-edge technologies to drive innovation and provide high-quality, scalable services that cater to the evolving needs of our customers.",
      },
      {
        order_no: 2,
        question:
          "Provide the high-level business process logic of the AI system. Is it possible to explain the inner workings of the AI system to the end-user by linking specific responses to the source data or documents? Outline any Explainable AI (XAI) model used, with respect to both local and global explainability.",
        hint: "Outline the Explainable AI (XAI) models used and how specific responses are linked to source data for both local and global explainability.",
        priority_level: "high priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "Our AI system processes data through machine learning models that classify input data based on predefined categories, making decisions by analyzing the relationship between various data points. We utilize Explainable AI (XAI) models to ensure that decisions made by the AI can be easily interpreted by end-users. For local explainability, we use methods like LIME to show which features influence the model’s prediction, while for global explainability, we employ SHAP values to explain the overall behavior of the model and how it considers all inputs.",
      },
      {
        order_no: 3,
        question:
          "To what extent can the operation of the application/algorithm be explained to end users and those involved?",
        hint: "Describe efforts to explain the AI system''s operations to users in a clear and understandable way, tailored to their needs and skills.",
        priority_level: "medium priority",
        answer_type: "Long text",
        input_type: "Tiptap area",
        evidence_required: false,
        isrequired: true,
        evidence_files: [],
        dropdown_options: [],
        answer:
          "The operation of our AI system is explained to end-users through a combination of detailed documentation and interactive user interfaces that display how decisions are made. We focus on ensuring that our explanations are clear and tailored to different user skill levels. For example, for non-technical users, we provide simplified explanations using visual aids and examples, while for technical users, we offer access to more detailed insights into the algorithms, data sources, and model performance.",
      },
    ],
  },
];
