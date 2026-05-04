import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const PostMarketMonitoringByProviders = {
  id: 11,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "AI Lifecycle Risk Management",
      description:
        "Implement and document monitoring systems to track AI system performance and address risks post-deployment.",
      subControls: [
        {
          id: 1,
          title: "We define methods and tools for measuring AI system impacts.",
          description:
            "Establishing methods and tools ensures consistent evaluation of AI system effects on users, stakeholders, and society.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Exclamation,
      title: "AI Lifecycle Risk Management",
      description:
        "Establish a system for monitoring AI system operations based on usage instructions.",
      subControls: [
        {
          id: 1,
          title: "We monitor AI system operations based on usage instructions.",
          description:
            "Monitoring ensures systems operate within intended parameters and quickly identifies deviations.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Exclamation,
      title: "AI Lifecycle Risk Management",
      description:
        "Track and respond to errors and incidents related to AI systems through measurable activities.",
      subControls: [
        {
          id: 1,
          title: "We track and respond to errors and incidents through measurable activities.",
          description:
            "Effective tracking and response minimize the impact of errors and improve system resilience and compliance.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 4,
      icon: Exclamation,
      title: "AI Lifecycle Risk Management",
      description:
        "Consult with domain experts and end-users to inform risk management activities.",
      subControls: [
        {
          id: 1,
          title: "We consult with experts and end-users to inform risk management.",
          description:
            "Input from diverse perspectives ensures risk management strategies are comprehensive and practical.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 5,
      icon: Checked,
      title: "AI System Change Documentation",
      description: "Document changes to AI systems and their performance post-deployment.",
      subControls: [
        {
          id: 1,
          title:
            "We continuously evaluate if AI systems meet objectives and decide on ongoing deployment.",
          description:
            "Regular evaluations ensure systems continue to fulfill their intended purpose and remain aligned with organizational goals.",
        },
        {
          id: 2,
          title: "We document pre-determined changes and performance metrics.",
          description:
            "Documentation of changes and metrics supports traceability and ensures that modifications are aligned with compliance.",
        },
        {
          id: 3,
          title: "We regularly review and update AI systems to maintain regulatory compliance.",
          description:
            "Regular reviews ensure AI systems evolve in line with regulatory changes and industry standards.",
        },
        {
          id: 4,
          title: "We ensure that any system changes are documented and assessed for compliance.",
          description:
            "Thorough documentation and assessment of changes prevent compliance gaps and support accountability.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
