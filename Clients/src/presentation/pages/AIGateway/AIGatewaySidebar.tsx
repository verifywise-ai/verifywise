/**
 * AI Gateway Sidebar Component
 *
 * Sidebar navigation for the AI Gateway module.
 * Follows the SidebarShell pattern established by ShadowAISidebar.
 */

import { Router, BarChart3, MessageSquare, ShieldCheck, FileText, Settings, BookOpen, Layers } from "lucide-react";
import SidebarShell, {
  SidebarMenuItem,
} from "../../components/Sidebar/SidebarShell";

interface AIGatewaySidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  endpointsCount?: number;
  promptsCount?: number;
  virtualKeysCount?: number;
}

export default function AIGatewaySidebar({
  activeTab,
  onTabChange,
  endpointsCount = 0,
  promptsCount = 0,
}: AIGatewaySidebarProps) {
  const flatItems: SidebarMenuItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      value: "dashboard",
      icon: <BarChart3 size={16} strokeWidth={1.5} />,
    },
    {
      id: "endpoints",
      label: "Endpoints",
      value: "endpoints",
      icon: <Router size={16} strokeWidth={1.5} />,
      count: endpointsCount,
    },
    {
      id: "playground",
      label: "Playground",
      value: "playground",
      icon: <MessageSquare size={16} strokeWidth={1.5} />,
    },
    {
      id: "guardrails",
      label: "Guardrails",
      value: "guardrails",
      icon: <ShieldCheck size={16} strokeWidth={1.5} />,
    },
    {
      id: "prompts",
      label: "Prompts",
      value: "prompts",
      icon: <BookOpen size={16} strokeWidth={1.5} />,
      count: promptsCount,
    },
    {
      id: "models",
      label: "Models",
      value: "models",
      icon: <Layers size={16} strokeWidth={1.5} />,
    },
    {
      id: "logs",
      label: "Logs",
      value: "logs",
      icon: <FileText size={16} strokeWidth={1.5} />,
    },
    {
      id: "settings",
      label: "Settings",
      value: "settings",
      icon: <Settings size={16} strokeWidth={1.5} />,
    },
  ];

  const isItemActive = (item: SidebarMenuItem): boolean => {
    return item.value === activeTab;
  };

  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.value) {
      onTabChange(item.value);
    }
  };

  return (
    <SidebarShell
      flatItems={flatItems}
      recentSections={[]}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      showReadyToSubscribe={false}
      enableFlyingHearts={false}
    />
  );
}
