import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const Registration = {
  id: 9,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "EU Database Registration",
      description:
        "Register providers, authorized representatives, and deployers, along with their AI systems, in the EU database as required by the AI Act.",
      subControls: [
        {
          id: 1,
          title: "We complete the relevant conformity assessment procedures.",
          description:
            "Completing assessments ensures that AI systems meet required safety and compliance standards before deployment.",
        },
        {
          id: 2,
          title: "We verify that high-risk AI systems have the required CE marking.",
          description:
            "CE marking confirms that high-risk AI systems meet EU regulatory requirements, ensuring safety and compliance.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Conformity Assessment Completion",
      description: "Complete relevant conformity assessment procedures for AI systems.",
      subControls: [
        {
          id: 1,
          title: "We ensure AI systems are registered in the EU database per Article 71.",
          description:
            "Registering systems ensures compliance with EU AI Act requirements and facilitates monitoring and transparency.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "Conformity Assessment Completion",
      description: "Identify necessary technical standards and certifications for AI systems.",
      subControls: [
        {
          id: 1,
          title: "We identify necessary technical standards and certifications for AI systems.",
          description:
            "Identifying relevant standards ensures systems are developed and deployed in compliance with industry and legal requirements.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 4,
      icon: Checked,
      title: "Conformity Assessment Completion",
      description:
        "To ensure that high-risk AI systems or general-purpose AI models comply with the common specifications established by the Commission.",
      subControls: [
        {
          id: 1,
          title: "We comply with common specifications established by the Commission.",
          description:
            "Adhering to common specifications ensures systems meet regulatory benchmarks for safety, reliability, and performance.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 5,
      icon: Checked,
      title: "Conformity Assessment Completion",
      description:
        "Comply with common specifications established by the Commission for AI systems.",
      subControls: [
        {
          id: 1,
          title: "We keep records of all registration activities and updates.",
          description:
            "Maintaining detailed records supports transparency, accountability, and regulatory compliance during system registration.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 6,
      icon: Checked,
      title: "Registration Information Maintenance",
      description:
        "Maintain comprehensive records of high-risk AI systems in the EU database, ensuring compliance with documentation and responsiveness to authorities.",
      subControls: [
        {
          id: 1,
          title: "Ensure timely and accurate data entry into the EU database.",
          description:
            "Accurate and timely data entry ensures compliance with regulatory requirements and keeps the database current.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 7,
      icon: Checked,
      title: "Registration Information Maintenance",
      description:
        "Maintain up-to-date registration information and comprehensive conformity documentation.",
      subControls: [
        {
          id: 1,
          title:
            "We maintain up-to-date registration information and comprehensive conformity documentation.",
          description:
            "Keeping documentation updated ensures alignment with changes in regulations and system configurations.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
