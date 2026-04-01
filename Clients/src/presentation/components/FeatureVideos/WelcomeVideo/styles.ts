import { brand, background } from "../../../themes/palette";
export const COLORS = {
  background: "#0a0a0a",
  primary: `${brand.primary}`,
  primaryLight: "#1a9d7e",
  white: `${background.main}`,
  subtitle: "#999999",
  tag: "#666666",
  accentLine: `${brand.primary}`,
} as const;

export const FPS = 30;

export const SCENE_DURATIONS = {
  intro: 135, // 4.5s
  feature: 150, // 5s
  benefits: 150, // 5s
  outro: 135, // 4.5s
  transition: 15, // 0.5s
} as const;

// Font family for inline styles (loaded via @font-face in the app)
export const FONT_FAMILY = "'Geist', system-ui, -apple-system, sans-serif";

export const FEATURES = [
  {
    number: "01",
    category: "INVENTORY",
    title: "Model inventory\n& lifecycle",
    description:
      "Track every AI model from development through deployment with full lifecycle governance.",
  },
  {
    number: "02",
    category: "INTAKE",
    title: "Intake forms\nwith risk scoring",
    description:
      "Standardized intake process with automated risk classification for new AI use cases.",
  },
  {
    number: "03",
    category: "INCIDENTS",
    title: "Incident\nmanagement",
    description:
      "Report, track, and resolve AI incidents with structured workflows and audit trails.",
  },
  {
    number: "04",
    category: "EVIDENCE",
    title: "Evidence hub",
    description:
      "Centralized repository linking documentation to compliance requirements and controls.",
  },
  {
    number: "05",
    category: "TRUST",
    title: "AI trust center",
    description:
      "Public-facing transparency portal showcasing your organization's AI governance posture.",
  },
  {
    number: "06",
    category: "COMPLIANCE",
    title: "Compliance\nframeworks",
    description:
      "EU AI Act, ISO 42001, NIST AI RMF, SOC 2, GDPR, and more with pluggable framework support.",
  },
  {
    number: "07",
    category: "AUTOMATION",
    title: "Automations\n& workflows",
    description:
      "Rule-based automation engine with approval workflows, email notifications, and Slack integration.",
  },
  {
    number: "08",
    category: "PLATFORM",
    title: "Plugin\nmarketplace",
    description:
      "Extend the platform with 30+ plugins for frameworks, integrations, and custom workflows.",
  },
] as const;

export const BENEFITS = [
  "Audit readiness at all times",
  "Full portfolio visibility",
  "Accelerated compliance",
  "Shadow AI detection",
  "Stakeholder confidence",
] as const;