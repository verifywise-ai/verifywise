import React, { useEffect, useContext } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Home,
  Flag,
  BarChart3,
  AlertTriangle,
  Building,
  FileText,
  Brain,
  Shield,
  GraduationCap,
  List as ListIcon,
  FolderTree,
  Layers,
  AlertCircle,
  Bot,
  Network,
  Database,
  Rocket,
} from "lucide-react";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import useMultipleOnScreen from "../../../application/hooks/useMultipleOnScreen";
import { useOpenTasksCount } from "../../../application/hooks/useOpenTasksCount";
import SidebarShell, { SidebarMenuItem, SidebarMenuGroup } from "./SidebarShell";

import VWIcon, { type VWIconName } from "../VWIcon";
import { isClassicUi } from "../../themes/uiStyle";

import "./index.css";

const classicUi = isClassicUi();

/** Phase 1 uses the VerifyWise icon set in the sidebar; classic keeps Lucide. */
const navIcon = (classicIcon: React.ReactElement, name: VWIconName): React.ReactElement =>
  classicUi ? classicIcon : <VWIcon name={name} size={16} />;

interface SidebarProps {
  onOpenCreateDemoData?: () => void;
  onOpenDeleteDemoData?: () => void;
  onDismissDemoDataButton?: () => void;
  showDemoDataButton?: boolean;
  hasDemoData?: boolean;
  /** Only show demo data options to admins */
  isAdmin?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  onOpenCreateDemoData,
  onOpenDeleteDemoData,
  onDismissDemoDataButton,
  showDemoDataButton = true,
  hasDemoData = false,
  isAdmin = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { changeComponentVisibility } = useContext(VerifyWiseContext);
  const { refs: _refs, allVisible } = useMultipleOnScreen<HTMLElement>({
    countToTrigger: 1,
  });

  const openTasksCount = useOpenTasksCount();

  useEffect(() => {
    if (allVisible) {
      changeComponentVisibility("sidebar", true);
    }
  }, [allVisible]);

  // Top level items
  const topItems: SidebarMenuItem[] = [
    {
      id: "start-here",
      label: "Start here",
      icon: navIcon(<Rocket size={16} strokeWidth={1.5} />, "home"),
      path: "/start-here",
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: navIcon(<Home size={16} strokeWidth={1.5} />, "dashboard"),
      path: "/",
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: navIcon(<Flag size={16} strokeWidth={1.5} />, "tasks"),
      path: "/tasks",
      count: openTasksCount,
    },
    {
      id: "frameworks",
      label: "Frameworks",
      icon: navIcon(<Layers size={16} strokeWidth={1.5} />, "compliance-frameworks"),
      path: "/framework",
    },
  ];

  // Menu groups
  const menuGroups: SidebarMenuGroup[] = [
    {
      name: "INVENTORY",
      items: [
        {
          id: "use-cases",
          label: "Use cases",
          icon: navIcon(<FolderTree size={16} strokeWidth={1.5} />, "use-cases"),
          path: "/overview",
          highlightPaths: ["/project-view"],
        },
        {
          id: "model-inventory",
          label: "Model inventory",
          icon: navIcon(<ListIcon size={16} strokeWidth={1.5} />, "models"),
          path: "/model-inventory",
        },
        {
          id: "ai-apps",
          label: "AI apps",
          icon: navIcon(<Bot size={16} strokeWidth={1.5} />, "ai-apps"),
          path: "/ai-apps",
        },
        {
          id: "datasets",
          label: "Datasets",
          icon: navIcon(<Database size={16} strokeWidth={1.5} />, "datasets"),
          path: "/datasets",
        },
        {
          id: "agent-discovery",
          label: "AI agents",
          icon: navIcon(<Network size={16} strokeWidth={1.5} />, "agents"),
          path: "/agent-discovery",
        },
      ],
    },
    {
      name: "ASSURANCE",
      items: [
        {
          id: "risk-management",
          label: "Risk management",
          icon: navIcon(<AlertTriangle size={16} strokeWidth={1.5} />, "risk-management"),
          path: "/risk-management",
        },
        {
          id: "training-registry",
          label: "Training registry",
          icon: navIcon(<GraduationCap size={16} strokeWidth={1.5} />, "training"),
          path: "/training",
        },
        {
          id: "evidence",
          label: "Evidence",
          icon: navIcon(<FileText size={16} strokeWidth={1.5} />, "evidence-management"),
          path: "/file-manager",
        },
        {
          id: "reporting",
          label: "Reporting",
          icon: navIcon(<BarChart3 size={16} strokeWidth={1.5} />, "reports"),
          path: "/reporting",
        },
        {
          id: "ai-trust-center",
          label: "AI trust center",
          icon: navIcon(<Brain size={16} strokeWidth={1.5} />, "public-page"),
          path: "/ai-trust-center",
        },
      ],
    },
    {
      name: "GOVERNANCE",
      items: [
        {
          id: "vendors",
          label: "Vendors",
          icon: navIcon(<Building size={16} strokeWidth={1.5} />, "vendor-management"),
          path: "/vendors",
        },
        {
          id: "policy-manager",
          label: "Policy manager",
          icon: navIcon(<Shield size={16} strokeWidth={1.5} />, "policies"),
          path: "/policies",
        },
        {
          id: "incident-management",
          label: "Incident management",
          icon: navIcon(<AlertCircle size={16} strokeWidth={1.5} />, "incident-management"),
          path: "/ai-incident-managements",
        },
      ],
    },
  ];

  // Check if item is active based on current path
  const isItemActive = (item: SidebarMenuItem): boolean => {
    if (item.path === "/" && location.pathname === "/") {
      return true;
    }
    if (item.path && item.path !== "/" && location.pathname === item.path) {
      return true;
    }
    if (item.path && location.pathname.startsWith(`${item.path}/`)) {
      return true;
    }
    if (item.highlightPaths?.some((p) => location.pathname.startsWith(p))) {
      return true;
    }
    // Special case for assessments
    if (location.pathname === "/all-assessments" && item.path === "/assessment") {
      return true;
    }
    return false;
  };

  // Handle item click - navigate to path
  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <SidebarShell
      topItems={topItems}
      menuGroups={menuGroups}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
      hasDemoData={hasDemoData}
      onOpenCreateDemoData={onOpenCreateDemoData}
      onOpenDeleteDemoData={onOpenDeleteDemoData}
      onDismissDemoDataButton={onDismissDemoDataButton}
      showDemoDataButton={showDemoDataButton}
      showReadyToSubscribe={true}
      isAdmin={isAdmin}
      enableFlyingHearts={true}
    />
  );
};

export default Sidebar;
