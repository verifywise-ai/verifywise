import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const ReportingSeriousIncidents = {
  id: 12,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Unexpected Impact Integration",
      description:
        "Report any serious incidents involving AI systems to relevant market surveillance authorities within specified timeframes.",
      subControls: [
        {
          id: 1,
          title: "We implement processes to capture and integrate unexpected impact inputs.",
          description:
            "Capturing unforeseen impacts helps refine systems and address emerging risks proactively.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "AI Model Capability Assessment",
      description:
        "Conduct comprehensive assessments of AI model capabilities using appropriate tools.",
      subControls: [
        {
          id: 1,
          title: "We assess AI model capabilities using appropriate tools.",
          description:
            "Capability assessments verify that AI models perform as intended and meet required safety and quality standards.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 3,
      icon: Checked,
      title: "Post-Deployment Incident Monitoring",
      description: "Monitor incidents related to AI systems and respond post-deployment.",
      subControls: [
        {
          id: 1,
          title: "We develop plans to address unexpected risks as they arise.",
          description:
            "Proactive risk plans ensure quick and effective responses to emerging challenges or unforeseen issues.",
        },
        {
          id: 2,
          title: "We monitor and respond to incidents post-deployment.",
          description:
            "Post-deployment monitoring identifies and mitigates issues, ensuring continued compliance and system reliability.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 4,
      icon: Checked,
      title: "AI System Logging Implementation",
      description: "Ensure providers implement systems for capturing and storing AI system logs.",
      subControls: [
        {
          id: 1,
          title: "We ensure providers implement systems for capturing and storing AI system logs.",
          description:
            "Logging systems provide traceability, aiding audits and troubleshooting while supporting regulatory requirements.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
    {
      id: 5,
      icon: Checked,
      title: "Serious Incident Immediate Reporting",
      description:
        "Immediately report serious incidents to providers, importers, distributors, and authorities.",
      subControls: [
        {
          id: 1,
          title:
            "We immediately report serious incidents to providers, importers, distributors, and relevant authorities.",
          description:
            "Prompt reporting ensures accountability and timely resolution of incidents, minimizing potential harm.",
        },
      ],
      owner: "Jane Smith",
      noOfSubControls: "6 (3 left)",
      completion: "50%",
    },
  ],
};
