import { IControlCategory } from "../../interfaces/i.controlCategory";

export const ControlCategories = (projectId1: number, projectId2: number): IControlCategory[] => {
  return [
    { order_no: 1, title: "AI literacy", project_id: projectId1 },
    {
      order_no: 2,
      title: "Transparency and provision of information to deployers",
      project_id: projectId1,
    },
    {
      order_no: 3,
      title: "Human oversight",
      project_id: projectId1,
    },
    {
      order_no: 4,
      title: "Corrective actions and duty of information",
      project_id: projectId1,
    },
    {
      order_no: 5,
      title: "Responsibilities along the AI value chain",
      project_id: projectId1,
    },
    {
      order_no: 6,
      title: "Obligations of deployers of high-risk AI systems",
      project_id: projectId1,
    },
    {
      order_no: 7,
      title: "Fundamental rights impact assessments for high-risk AI systems",
      project_id: projectId1,
    },
    {
      order_no: 8,
      title: "Transparency obligations for providers and users of certain AI systems",
      project_id: projectId1,
    },
    { order_no: 9, title: "Registration", project_id: projectId1 },
    {
      order_no: 10,
      title: "EU database for high-risk AI systems listed in Annex III",
      project_id: projectId1,
    },
    {
      order_no: 11,
      title:
        "Post-market monitoring by providers and post-market monitoring plan for high-risk AI systems",
      project_id: projectId1,
    },
    {
      order_no: 12,
      title: "Reporting of serious incidents",
      project_id: projectId1,
    },
    {
      order_no: 13,
      title: "General-purpose AI models",
      project_id: projectId1,
    },
    { order_no: 1, title: "AI literacy", project_id: projectId2 },
    {
      order_no: 2,
      title: "Transparency and provision of information to deployers",
      project_id: projectId2,
    },
    {
      order_no: 3,
      title: "Human oversight",
      project_id: projectId2,
    },
    {
      order_no: 4,
      title: "Corrective actions and duty of information",
      project_id: projectId2,
    },
    {
      order_no: 5,
      title: "Responsibilities along the AI value chain",
      project_id: projectId2,
    },
    {
      order_no: 6,
      title: "Obligations of deployers of high-risk AI systems",
      project_id: projectId2,
    },
    {
      order_no: 7,
      title: "Fundamental rights impact assessments for high-risk AI systems",
      project_id: projectId2,
    },
    {
      order_no: 8,
      title: "Transparency obligations for providers and users of certain AI systems",
      project_id: projectId2,
    },
    { order_no: 9, title: "Registration", project_id: projectId2 },
    {
      order_no: 10,
      title: "EU database for high-risk AI systems listed in Annex III",
      project_id: projectId2,
    },
    {
      order_no: 11,
      title:
        "Post-market monitoring by providers and post-market monitoring plan for high-risk AI systems",
      project_id: projectId2,
    },
    {
      order_no: 12,
      title: "Reporting of serious incidents",
      project_id: projectId2,
    },
    {
      order_no: 13,
      title: "General-purpose AI models",
      project_id: projectId2,
    },
  ];
};
