import {
  LayoutDashboard,
  FlaskConical,
  Database,
  Award,
  Settings,
  KeyRound,
  Swords,
  Trophy,
  Cpu,
  MessageSquare,
  Scale,
  FileText,
} from "lucide-react";
import SidebarShell, {
  SidebarMenuItem,
  RecentSection,
  ProjectSelectorConfig,
} from "../../components/Sidebar/SidebarShell";

interface RecentExperiment {
  id: string;
  name: string;
  projectId: string;
}

interface RecentProject {
  id: string;
  name: string;
}

interface EvalProject {
  id: string;
  name: string;
}

interface EvalsSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  experimentsCount?: number;
  datasetsCount?: number;
  scorersCount?: number;
  modelsCount?: number;
  arenaCount?: number;
  disabled?: boolean;
  recentExperiments?: RecentExperiment[];
  recentProjects?: RecentProject[];
  onExperimentClick?: (experimentId: string, projectId: string) => void;
  onProjectClick?: (projectId: string) => void;
  // Project selector props
  currentProject?: EvalProject | null;
  allProjects?: EvalProject[];
  onProjectChange?: (projectId: string) => void;
}

export default function EvalsSidebar({
  activeTab,
  onTabChange,
  experimentsCount = 0,
  datasetsCount = 0,
  scorersCount = 0,
  modelsCount = 0,
  arenaCount = 0,
  disabled = false,
  recentExperiments = [],
  recentProjects = [],
  onExperimentClick,
  onProjectClick,
  currentProject,
  allProjects = [],
  onProjectChange,
}: EvalsSidebarProps) {
  // Menu items for Evals
  const flatItems: SidebarMenuItem[] = [
    {
      id: "overview",
      label: "Overview",
      value: "overview",
      icon: <LayoutDashboard size={16} strokeWidth={1.5} />,
      disabled: false, // Always enabled - shows projects list
    },
    {
      id: "experiments",
      label: "Experiments",
      value: "experiments",
      icon: <FlaskConical size={16} strokeWidth={1.5} />,
      count: experimentsCount,
      disabled: disabled,
    },
    {
      id: "datasets",
      label: "Datasets",
      value: "datasets",
      icon: <Database size={16} strokeWidth={1.5} />,
      count: datasetsCount,
      disabled: false, // Always enabled - org-scoped
    },
    {
      id: "scorers",
      label: "Scorers",
      value: "scorers",
      icon: <Award size={16} strokeWidth={1.5} />,
      count: scorersCount,
      disabled: false, // Always enabled - org-scoped
    },
    {
      id: "models",
      label: "Models",
      value: "models",
      icon: <Cpu size={16} strokeWidth={1.5} />,
      count: modelsCount,
      disabled: false, // Always enabled - org-scoped
    },
    {
      id: "playground",
      label: "Playground",
      value: "playground",
      icon: <MessageSquare size={16} strokeWidth={1.5} />,
      disabled: false, // Always enabled - chat with any model
    },
    {
      id: "arena",
      label: "Arena",
      value: "arena",
      icon: <Swords size={16} strokeWidth={1.5} />,
      count: arenaCount,
      disabled: false, // Always enabled - org-scoped
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      value: "leaderboard",
      icon: <Trophy size={16} strokeWidth={1.5} />,
      disabled: false,
    },
    {
      id: "bias-audits",
      label: "Bias audits",
      value: "bias-audits",
      icon: <Scale size={16} strokeWidth={1.5} />,
      disabled: false,
    },
    {
      id: "reports",
      label: "Reports",
      value: "reports",
      icon: <FileText size={16} strokeWidth={1.5} />,
      disabled: disabled,
      dividerAfter: true,
    },
    {
      id: "configuration",
      label: "Configuration",
      value: "configuration",
      icon: <Settings size={16} strokeWidth={1.5} />,
      disabled: disabled,
    },
    {
      id: "settings",
      label: "Settings",
      value: "settings",
      icon: <KeyRound size={16} strokeWidth={1.5} />,
      disabled: false, // Organization-wide settings - always enabled
    },
  ];

  // Recent sections
  const recentSections: RecentSection[] = [
    {
      title: "Recent experiments",
      items: recentExperiments.map((exp) => ({
        id: exp.id,
        name: exp.name,
        onClick: () => onExperimentClick?.(exp.id, exp.projectId),
      })),
    },
    {
      title: "Recent projects",
      items: recentProjects.map((proj) => ({
        id: proj.id,
        name: proj.name,
        onClick: () => onProjectClick?.(proj.id),
      })),
    },
  ];

  // Check if item is active based on activeTab
  const isItemActive = (item: SidebarMenuItem): boolean => {
    return item.value === activeTab || item.id === activeTab;
  };

  // Handle item click - change tab
  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.value) {
      onTabChange(item.value);
    }
  };

  // Build project selector config - always show if we have a change handler
  // This allows users to select a project or create one even when on the projects list page
  const projectSelectorConfig: ProjectSelectorConfig | undefined =
    onProjectChange
      ? {
        currentProject: currentProject || null,
        allProjects,
        onProjectChange,
      }
      : undefined;

  return (
    <SidebarShell
      flatItems={flatItems}
      recentSections={recentSections}
      projectSelector={projectSelectorConfig}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      showReadyToSubscribe={false}
      enableFlyingHearts={false}
    />
  );
}
