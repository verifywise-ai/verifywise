import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const HumanOversight = {
  id: 3,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Human Intervention Mechanisms",
      description: "Assign competent individuals with authority to oversee AI system usage.",
      subControls: [
        {
          id: 1,
          title: "We define mechanisms for human intervention or override of AI outputs.",
          description:
            "Human intervention mechanisms ensure appropriate oversight, preventing harmful or unintended AI outcomes.",
        },
        {
          id: 2,
          title: "We assign competent individuals with authority to oversee AI system usage.",
          description:
            "Competent oversight personnel are essential for monitoring and ensuring safe and lawful AI usage.",
        },
        {
          id: 3,
          title: "We align oversight measures with provider's instructions for use.",
          description:
            "Aligning measures with provider instructions ensures system use remains within intended boundaries and purposes.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Oversight Documentation",
      description: "Document system limitations and human oversight options.",
      subControls: [
        {
          id: 1,
          title: "We document system limitations and human oversight options.",
          description:
            "Documentation ensures clarity on system boundaries and how human operators can intervene if needed.",
        },
        {
          id: 2,
          title: "We establish appeal processes related to AI system decisions.",
          description:
            "Appeals processes provide a structured method for addressing disputes or adverse outcomes from AI system decisions.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "Oversight Documentation",
      description:
        "Ensure clear communication of AI system capabilities, limitations, and risks to human operators.",
      subControls: [
        {
          id: 1,
          title:
            "We ensure clear communication of AI system capabilities, limitations, and risks to human operators.",
          description:
            "Clear communication helps operators understand the system’s scope and manage risks effectively.",
        },
        {
          id: 2,
          title: "We proportion oversight measures to match AI system's risk level and autonomy.",
          description:
            "Oversight measures are scaled appropriately to reflect the system's complexity, risk, and decision-making autonomy.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
