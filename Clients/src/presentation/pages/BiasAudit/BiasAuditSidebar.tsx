/**
 * @fileoverview LL 144 Bias Audit Sidebar Component
 *
 * Sidebar navigation for the LL 144 bias audit module: the profile, corpus
 * generation, runs and scope determinations of the use case the page shows.
 * Follows the SidebarShell pattern established by AIDetectionSidebar.
 *
 * @module pages/BiasAudit/BiasAuditSidebar
 */

import { useCallback } from "react";
import { ClipboardList, Database, Play, FileText } from "lucide-react";
import SidebarShell, { SidebarMenuItem } from "../../components/Sidebar/SidebarShell";
import { useUserGuideSidebarContext } from "../../components/UserGuide/UserGuideSidebarContext";
import type { BiasAuditSection } from "./sections";

interface BiasAuditSidebarProps {
  activeSection: BiasAuditSection;
  onSectionChange: (section: BiasAuditSection) => void;
  runsCount?: number;
  scopeCount?: number;
  /** No use case has the framework yet, so there is nothing to open. */
  disabled?: boolean;
}

export default function BiasAuditSidebar({
  activeSection,
  onSectionChange,
  runsCount = 0,
  scopeCount = 0,
  disabled = false,
}: BiasAuditSidebarProps) {
  const { open: openUserGuide, openTab } = useUserGuideSidebarContext();
  const openReleaseNotes = useCallback(() => openTab("whats-new"), [openTab]);

  const flatItems: SidebarMenuItem[] = [
    {
      id: "profile",
      label: "Profile",
      value: "profile",
      icon: <ClipboardList size={16} strokeWidth={1.5} />,
      disabled,
    },
    {
      id: "generate",
      label: "Test candidates",
      value: "generate",
      icon: <Database size={16} strokeWidth={1.5} />,
      disabled,
    },
    {
      id: "runs",
      label: "Runs",
      value: "runs",
      icon: <Play size={16} strokeWidth={1.5} />,
      count: runsCount,
      disabled,
    },
    {
      id: "scope",
      label: "Scope determination",
      value: "scope",
      icon: <FileText size={16} strokeWidth={1.5} />,
      count: scopeCount,
      disabled,
    },
  ];

  const isItemActive = (item: SidebarMenuItem): boolean => item.value === activeSection;

  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.value) {
      onSectionChange(item.value as BiasAuditSection);
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
