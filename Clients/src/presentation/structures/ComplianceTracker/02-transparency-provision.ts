import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const TransparencyProvision = {
  id: 2,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Intended Use Description",
      description: "Review and verify technical documentation from AI system providers.",
      subControls: [
        {
          id: 1,
          title: "We provide detailed descriptions of the AI system's intended use.",
          description:
            "Describing intended use prevents misuse, aligning AI deployment with specified legal and ethical boundaries.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Technical Documentation Review",
      description: "Review and verify technical documentation from AI system providers.",
      subControls: [
        {
          id: 1,
          title: "We review and verify technical documentation from providers.",
          description:
            "	Reviewing documentation confirms provider accuracy and ensures adherence to standards and compliance needs.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "Record Maintenance of AI System Activities",
      description:
        "Maintain accurate records of all AI system activities, including modifications and third-party involvements.",
      subControls: [
        {
          id: 1,
          title:
            "We maintain accurate records of all AI system activities, including modifications and third-party involvements.",
          description:
            "Accurate records enhance traceability, support audits, and provide accountability for AI system activities.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "10%",
    },
    {
      id: 4,
      icon: Checked,
      title: "System Information Documentation",
      description:
        "Document all information about the AI system, including its capabilities, limitations, and any relevant technical details.",
      subControls: [
        {
          id: 1,
          title:
            "We document system information, including functionality, limitations, and risk controls.",
          description:
            "System documentation clarifies operations, limitations, and controls, aiding informed decision-making and safety.",
        },
        {
          id: 2,
          title: "We define and document forbidden uses and foresee potential misuse.",
          description:
            "Defining forbidden uses helps anticipate misuse and mitigate risks proactively for safe AI applications.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "30%",
    },
    {
      id: 5,
      icon: Checked,
      title: "Dataset Description",
      description: "Describe training, validation, and testing datasets used in AI systems.",
      subControls: [
        {
          id: 1,
          title: "We describe training, validation, and testing datasets used.",
          description:
            "Dataset descriptions provide transparency in training, validation, and testing, ensuring alignment with standards.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "30%",
    },
    {
      id: 6,
      icon: Checked,
      title: "Mitigation Strategies and Bias Testing",
      description: "Explain mitigation strategies and document bias testing results.",
      subControls: [
        {
          id: 1,
          title: "We explain mitigation strategies and bias testing results.",
          description:
            "Explaining bias testing and mitigation highlights fairness measures and prevents harmful or unethical outcomes.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "39%",
    },
    {
      id: 7,
      icon: Checked,
      title: "AI System Accuracy and Security Information",
      description:
        "Provide accuracy metrics, robustness, and cybersecurity information for AI systems.",
      subControls: [
        {
          id: 1,
          title: "We provide accuracy metrics, robustness, and cybersecurity information.",
          description:
            "Providing metrics ensures systems meet robustness and security criteria while fostering trust through transparency.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "89%",
    },
  ],
};
