import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const EUdatabaseForHighRiskAI = {
  id: 10,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Registration Activity Records Maintenance",
      description:
        "Maintain comprehensive records of high-risk AI systems in the EU database, ensuring compliance with documentation and responsiveness to authorities.",
      subControls: [
        {
          id: 1,
          title: "We engage with notified bodies or conduct internal conformity assessments.",
          description:
            "Collaboration with notified bodies or conducting internal reviews ensures rigorous evaluation of AI system compliance.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "10%",
    },
    {
      id: 2,
      icon: Exclamation,
      title: "Registration Activity Records Maintenance",
      description:
        "Implement and document monitoring systems to track AI system performance and address risks post-deployment.",
      subControls: [
        {
          id: 1,
          title: "We establish processes to respond to national authority requests.",
          description:
            "Well-defined processes enable efficient and accurate responses to regulatory inquiries or audits.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "80%",
    },
    {
      id: 3,
      icon: Exclamation,
      title: "Registration Activity Records Maintenance",
      description:
        "Maintain up-to-date registration information and comprehensive conformity documentation.",
      subControls: [
        {
          id: 1,
          title: "We maintain thorough documentation of AI system conformity.",
          description:
            "Comprehensive conformity documentation demonstrates adherence to legal standards and supports regulatory reporting.",
        },
        {
          id: 2,
          title: "We keep records of registration and any subsequent updates.",
          description:
            "Detailed records of registration activities provide transparency and facilitate compliance verification.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "80%",
    },
    {
      id: 4,
      icon: Checked,
      title: "EU Database Data Entry Timeliness",
      description:
        "Maintain up-to-date registration information and comprehensive conformity documentation.",
      subControls: [
        {
          id: 1,
          title: "We ensure timely and accurate data entry into the EU database.",
          description:
            "Ensuring timely updates maintains regulatory compliance and fosters trust in system integrity and monitoring processes.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "80%",
    },
  ],
};
