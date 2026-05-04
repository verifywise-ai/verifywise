import Checked from "../../assets/icons/check-circle-green.svg";

export const AIliteracy = {
  id: 1,
  controls: [
    {
      id: 1,
      icon: Checked,
      title: "AI Literacy and Responsible AI Training",
      description:
        "Develop the AI literacy of staff and others who operate or use AI systems on behalf of the organization.",
      subControls: [
        {
          id: 1,
          title:
            "We ensure executive leadership takes responsibility for decisions related to AI risks",
          description:
            "Leadership is accountable for oversight and strategic decisions regarding AI risks, ensuring alignment with compliance.",
        },
        {
          id: 2,
          title: "We provide AI literacy and ethics training to relevant personnel.",
          description:
            "Training equips employees to responsibly manage and understand AI systems, fostering ethics and legal adherence.",
        },
        {
          id: 3,
          title:
            "We develop a clear and concise communication plan for informing workers about the use of high-risk AI systems in the workplace.",
          description:
            "A concise plan ensures employees are informed of AI system impacts in their workplace roles and rights.",
        },
      ],
      owner: "Rachelle Swing",
      noOfSubControls: "5 (2 left)",
      completion: "45%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Regulatory Training and Response Procedures",
      description:
        "Train personnel on regulatory requirements and procedures for responding to authority requests.",
      subControls: [
        {
          id: 1,
          title: "We clearly define roles and responsibilities related to AI risk management.",
          description:
            "Roles and responsibilities streamline risk management and assign clear accountability for compliance efforts.",
        },
        {
          id: 2,
          title:
            "We train personnel on the requirements of the regulation and the process for responding to requests from competent authorities.",
          description:
            "Personnel training ensures efficient regulatory responses and familiarity with legal requirements for AI systems.",
        },
      ],
      owner: "Mike Arthurs",
      noOfSubControls: "3 (1 left)",
      completion: "22%",
    },
  ],
};
