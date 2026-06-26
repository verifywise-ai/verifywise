/**
 * @fileoverview Regulations Tracker Sidebar Component
 *
 * Sidebar navigation for the Regulations Tracker module.
 * Follows the SidebarShell pattern established by AITrustIndexSidebar.
 *
 * @module pages/RegulationsTracker/RegulationsTrackerSidebar
 */

import { useCallback } from "react";
import { Compass, Star, Settings } from "lucide-react";
import SidebarShell, { SidebarMenuItem } from "../../components/Sidebar/SidebarShell";
import { useUserGuideSidebarContext } from "../../components/UserGuide";

interface RegulationsTrackerSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  trackedCount?: number;
  isAdmin?: boolean;
}

export default function RegulationsTrackerSidebar({
  activeTab,
  onTabChange,
  trackedCount = 0,
  isAdmin = false,
}: RegulationsTrackerSidebarProps) {
  const { open: openUserGuide, openTab } = useUserGuideSidebarContext();
  const openReleaseNotes = useCallback(() => openTab("whats-new"), [openTab]);

  const flatItems: SidebarMenuItem[] = [
    {
      id: "browse",
      label: "Browse",
      value: "browse",
      icon: <Compass size={16} strokeWidth={1.5} />,
      disabled: false,
    },
    {
      id: "tracked",
      label: "Tracked",
      value: "tracked",
      icon: <Star size={16} strokeWidth={1.5} />,
      count: trackedCount,
      disabled: false,
    },
    ...(isAdmin
      ? [
          {
            id: "settings",
            label: "Settings",
            value: "settings",
            icon: <Settings size={16} strokeWidth={1.5} />,
            disabled: false,
          },
        ]
      : []),
  ];

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
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      showReadyToSubscribe={false}
      openUserGuide={openUserGuide}
      openReleaseNotes={openReleaseNotes}
      enableFlyingHearts={false}
    />
  );
}
