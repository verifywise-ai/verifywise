import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const CorrectiveActionsDutyOfInfo = {
  id: 4,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Proportionate Oversight Measures",
      description:
        "Take prompt and effective corrective actions for non-conforming high-risk AI systems and ensure ongoing system value post-deployment.",
      subControls: [
        {
          id: 1,
          title: "We consult with diverse experts and end-users to inform corrective measures.",
          description:
            "Consulting experts and end-users ensures corrective measures are comprehensive and address real-world implications.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "System Validation and Reliability Documentation",
      description:
        "Demonstrate and document the system's validity, reliability, and standards compliance.",
      subControls: [
        {
          id: 1,
          title: "We validate and document system reliability and standards compliance.",
          description:
            "Validation and documentation demonstrate that systems operate reliably and meet required compliance standards.",
        },
        {
          id: 2,
          title: "We sustain AI system value post-deployment through continuous improvements.",
          description:
            "Continuous improvements ensure AI systems remain effective, compliant, and aligned with user needs after deployment.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "Prompt Corrective Actions Implementation",
      description:
        "Implement corrective actions promptly and effectively to address identified risks or issues.",
      subControls: [
        {
          id: 1,
          title:
            "We implement corrective actions as required by Article 20 to address identified risks or issues.",
          description:
            "Prompt corrective actions address risks to maintain compliance and prevent harm resulting from system flaws.",
        },
        {
          id: 2,
          title:
            "We ensure mechanisms are in place to withdraw, disable, or recall non-conforming AI systems.",
          description:
            "Effective mechanisms ensure non-conforming systems can be removed or disabled to prevent further risks.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 4,
      icon: Checked,
      title: "Documentation of Corrective Actions",
      description: "Maintain documentation of corrective actions taken.",
      subControls: [
        {
          id: 1,
          title: "We maintain documentation of corrective actions taken.",
          description:
            "Detailed records of corrective actions provide accountability and support audits or regulatory reviews.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
