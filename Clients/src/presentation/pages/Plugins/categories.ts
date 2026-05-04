import { Layers, MessageSquare, GitBranch, Activity, Shield, LucideIcon } from "lucide-react";

export interface PluginCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const CATEGORIES: PluginCategory[] = [
  {
    id: "all",
    name: "All plugins",
    description: "Browse all available plugins to extend VerifyWise functionality.",
    icon: Layers,
  },
  {
    id: "communication",
    name: "Communication",
    description:
      "Integrate with messaging platforms and notification services to keep your team informed.",
    icon: MessageSquare,
  },
  {
    id: "ml_ops",
    name: "ML operations",
    description: "Connect with ML platforms to track experiments, models, and deployments.",
    icon: Activity,
  },
  {
    id: "version_control",
    name: "Version control",
    description: "Integrate with version control systems to track code changes and collaborate.",
    icon: GitBranch,
  },
  {
    id: "monitoring",
    name: "Monitoring",
    description:
      "Add observability and monitoring capabilities to track system health and performance.",
    icon: Activity,
  },
  {
    id: "security",
    name: "Security",
    description:
      "Enhance security with vulnerability scanning, access control, and compliance tools.",
    icon: Shield,
  },
];
