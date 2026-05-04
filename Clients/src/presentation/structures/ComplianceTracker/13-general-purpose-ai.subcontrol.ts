import Checked from "../../assets/icons/check-circle-green.svg";
import Exclamation from "../../assets/icons/alert-circle-orange.svg";

export const GeneralPurposeAImodels = {
  id: 13,
  controls: [
    {
      id: 1,
      icon: Exclamation,
      title: "Intended Use Description for General-Purpose AI Models",
      description:
        "Define and manage the intended and forbidden uses of general-purpose AI models, including modifications and content marking.",
      subControls: [
        {
          id: 1,
          title:
            "We document and prevent forbidden uses, distinguishing between foreseeable misuse and intended purposes.",
          description:
            "Clear documentation and proactive measures minimize risks associated with misuse of AI systems.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 2,
      icon: Checked,
      title: "Comprehensive AI System Documentation",
      description: "Ensure comprehensive documentation of AI system purposes and restrictions.",
      subControls: [
        {
          id: 1,
          title: "We ensure comprehensive documentation of AI system purposes and restrictions.",
          description:
            "Detailed documentation clarifies system capabilities, limitations, and appropriate use cases.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 3,
      icon: Exclamation,
      title: "Post-Market AI System Modification Management",
      description:
        "Manage and document any modifications to AI systems after placing on market or service.",
      subControls: [
        {
          id: 1,
          title: "We manage modifications to AI systems post-market placement.",
          description:
            "Managing post-market changes ensures continued compliance and alignment with system objectives.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 4,
      icon: Exclamation,
      title: "Illegal Content Prevention Countermeasures",
      description:
        "List and implement countermeasures to prevent the generation of illegal content by AI systems.",
      subControls: [
        {
          id: 1,
          title: "We list countermeasures to prevent illegal content generation.",
          description:
            "Countermeasures protect against misuse, ensuring AI systems do not produce or facilitate illegal activities.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 5,
      icon: Exclamation,
      title: "Synthetic Content Marking Mechanisms",
      description: "Implement machine-readable watermarks for AI-generated synthetic content.",
      subControls: [
        {
          id: 1,
          title: "We implement machine-readable watermarks for AI-generated content.",
          description:
            "Watermarks enhance transparency, allowing users to identify AI-generated content and mitigating risks of misuse.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
    {
      id: 6,
      icon: Exclamation,
      title: "Datasets Used Documentation",
      description: "Describe datasets used, including owned, free, and copyrighted data.",
      subControls: [
        {
          id: 1,
          title: "We describe datasets used, including owned, free, and copyrighted data.",
          description:
            "Dataset descriptions ensure transparency, compliance with intellectual property laws, and ethical use of data.",
        },
      ],
      owner: "John Doe",
      noOfSubControls: "4 (all completed)",
      completion: "100%",
    },
  ],
};
