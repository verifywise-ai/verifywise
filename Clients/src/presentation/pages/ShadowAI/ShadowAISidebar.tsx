/**
 * Shadow AI Sidebar Component
 *
 * Sidebar navigation for the Shadow AI module.
 * Follows the SidebarShell pattern established by AIDetectionSidebar.
 */

import { BarChart3, Users, Bot, ShieldAlert, Settings } from "lucide-react";
import SidebarShell, {
  SidebarMenuItem,
  RecentSection,
} from "../../components/Sidebar/SidebarShell";
import { RecentTool } from "../../../application/contexts/ShadowAISidebar.context";

interface ShadowAISidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  toolsCount?: number;
  alertsCount?: number;
  recentTools?: RecentTool[];
  onToolClick?: (toolId: number) => void;
}

export default function ShadowAISidebar({
  activeTab,
  onTabChange,
  toolsCount = 0,
  alertsCount = 0,
  recentTools = [],
  onToolClick,
}: ShadowAISidebarProps) {
  const flatItems: SidebarMenuItem[] = [
    {
      id: "insights",
      label: "Insights",
      value: "insights",
      icon: <BarChart3 size={16} strokeWidth={1.5} />,
    },
    {
      id: "users",
      label: "User activity",
      value: "users",
      icon: <Users size={16} strokeWidth={1.5} />,
    },
    {
      id: "tools",
      label: "AI tools",
      value: "tools",
      icon: <Bot size={16} strokeWidth={1.5} />,
      count: toolsCount,
    },
    {
      id: "rules",
      label: "Rules & alerts",
      value: "rules",
      icon: <ShieldAlert size={16} strokeWidth={1.5} />,
      count: alertsCount,
    },
    {
      id: "settings",
      label: "Settings",
      value: "settings",
      icon: <Settings size={16} strokeWidth={1.5} />,
    },
  ];

  const recentSections: RecentSection[] =
    recentTools.length > 0
      ? [
          {
            title: "Recent tools",
            items: recentTools.map((tool) => ({
              id: tool.id.toString(),
              name: tool.name,
              onClick: () => onToolClick?.(tool.id),
            })),
          },
        ]
      : [];

  const isItemActive = (item: SidebarMenuItem): boolean => {
    return item.value === activeTab || item.id === activeTab;
  };

  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.value) {
      onTabChange(item.value);
    }
  };

  return (
    <SidebarShell
      flatItems={flatItems}
      recentSections={recentSections}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      showReadyToSubscribe={false}
      enableFlyingHearts={false}
    />
  );
}
