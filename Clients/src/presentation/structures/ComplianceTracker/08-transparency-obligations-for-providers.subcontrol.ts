import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const TransparencyObligationsForProviders = {
  id: 7,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "User Notification of AI System Use",
      description:
        "Ensure clear communication that users are interacting with AI systems and provide comprehensive information about AI system functionalities and impacts.",
      subControls: [
        {
          id: 1,
          title: "We design AI systems to clearly indicate user interaction with AI.",
          description:
            "Clear indicators help users understand when they are interacting with AI, promoting transparency and trust.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Clear AI Indication for Users",
      description:
        "Ensure AI indications are clear and understandable for reasonably informed users.",
      subControls: [
        {
          id: 1,
          title: "We inform users when they are subject to AI system usage.",
          description:
            "Transparent communication ensures users are aware of and consent to AI system interactions affecting them.",
        },
        {
          id: 2,
          title:
            "We ensure AI indications are clear and understandable for reasonably informed users.",
          description:
            "Providing clear, simple AI indications allows users to make informed decisions and understand system limitations.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "AI System Scope and Impact Definition",
      description: "Define and document AI system scope, goals, methods, and potential impacts.",
      subControls: [
        {
          id: 1,
          title: "We define and document AI system scope, goals, methods, and potential impacts.",
          description:
            "Comprehensive documentation helps align AI deployment with intended goals and prepares for potential risks.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 4,
      icon: Checked,
      title: "AI System Scope and Impact Definition",
      description:
        "Maintain accurate records of AI system activities, including modifications and third-party involvements.",
      subControls: [
        {
          id: 1,
          title:
            "We maintain accurate records of AI system activities, modifications, and third-party involvements.",
          description:
            "Accurate records ensure accountability and support audits, troubleshooting, and regulatory compliance.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
