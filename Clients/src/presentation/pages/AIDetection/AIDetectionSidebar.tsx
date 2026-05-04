/**
 * @fileoverview AI Detection Sidebar Component
 *
 * Sidebar navigation for the AI Detection module.
 * Follows the SidebarShell pattern established by EvalsSidebar.
 *
 * @module pages/AIDetection/AIDetectionSidebar
 */

import { useCallback } from "react";
import { Search, FolderGit2, History, Settings } from "lucide-react";
import SidebarShell, {
  SidebarMenuItem,
  RecentSection,
} from "../../components/Sidebar/SidebarShell";
import { useUserGuideSidebarContext } from "../../components/UserGuide";
import { Scan } from "../../../domain/ai-detection/types";

interface RecentScan {
  id: number;
  name: string; // repository_owner/repository_name
}

interface AIDetectionSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  historyCount?: number;
  repositoryCount?: number;
  recentScans?: RecentScan[];
  onScanClick?: (scanId: number) => void;
}

export default function AIDetectionSidebar({
  activeTab,
  onTabChange,
  historyCount = 0,
  repositoryCount = 0,
  recentScans = [],
  onScanClick,
}: AIDetectionSidebarProps) {
  const { open: openUserGuide, openTab } = useUserGuideSidebarContext();
  const openReleaseNotes = useCallback(() => openTab("whats-new"), [openTab]);

  // Menu items for AI Detection
  const flatItems: SidebarMenuItem[] = [
    {
      id: "scan",
      label: "Scan",
      value: "scan",
      icon: <Search size={16} strokeWidth={1.5} />,
      disabled: false,
    },
    {
      id: "repositories",
      label: "Repositories",
      value: "repositories",
      icon: <FolderGit2 size={16} strokeWidth={1.5} />,
      count: repositoryCount,
      disabled: false,
    },
    {
      id: "history",
      label: "Scan results",
      value: "history",
      icon: <History size={16} strokeWidth={1.5} />,
      count: historyCount,
      disabled: false,
    },
    {
      id: "settings",
      label: "Settings",
      value: "settings",
      icon: <Settings size={16} strokeWidth={1.5} />,
      disabled: false,
    },
  ];

  // Recent sections
  const recentSections: RecentSection[] =
    recentScans.length > 0
      ? [
          {
            title: "Recent scans",
            items: recentScans.map((scan) => ({
              id: scan.id.toString(),
              name: scan.name,
              onClick: () => onScanClick?.(scan.id),
            })),
          },
        ]
      : [];

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

  return (
    <SidebarShell
      flatItems={flatItems}
      recentSections={recentSections}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      showReadyToSubscribe={false}
      openUserGuide={openUserGuide}
      openReleaseNotes={openReleaseNotes}
      enableFlyingHearts={false}
    />
  );
}

/**
 * Helper function to convert Scan to RecentScan format
 */
export function scanToRecentScan(scan: Scan): RecentScan {
  return {
    id: scan.id,
    name: `${scan.repository_owner}/${scan.repository_name}`,
  };
}
