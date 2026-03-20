import React, { useCallback, useEffect, useState, useContext } from "react";
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
  Database,
  Rocket,
} from "lucide-react";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import useMultipleOnScreen from "../../../application/hooks/useMultipleOnScreen";
import { getAllTasks } from "../../../application/repository/task.repository";
import { TaskStatus } from "../../../domain/enums/task.enum";
import { useUserGuideSidebarContext } from "../UserGuide";
import SidebarShell, { SidebarMenuItem, SidebarMenuGroup } from "./SidebarShell";
import "./index.css";

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
  const { open: openUserGuide, openTab } = useUserGuideSidebarContext();
  const openReleaseNotes = useCallback(() => openTab('whats-new'), [openTab]);
  const { changeComponentVisibility } = useContext(VerifyWiseContext);

  const { refs: _refs, allVisible } = useMultipleOnScreen<HTMLElement>({
    countToTrigger: 1,
  });

  const [openTasksCount, setOpenTasksCount] = useState(0);

  useEffect(() => {
    if (allVisible) {
      changeComponentVisibility("sidebar", true);
    }
  }, [allVisible]);

  // Fetch open tasks count
  useEffect(() => {
    const fetchOpenTasksCount = async () => {
      try {
        const response = await getAllTasks({
          status: [TaskStatus.OPEN],
        });
        setOpenTasksCount(response?.data?.tasks?.length || 0);
      } catch (error) {
        console.error("Error fetching open tasks count:", error);
        setOpenTasksCount(0);
      }
    };

    fetchOpenTasksCount();
    const interval = setInterval(fetchOpenTasksCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Top level items
  const topItems: SidebarMenuItem[] = [
    {
      id: "start-here",
      label: "Start here",
      icon: <Rocket size={16} strokeWidth={1.5} />,
      path: "/start-here",
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <Home size={16} strokeWidth={1.5} />,
      path: "/",
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: <Flag size={16} strokeWidth={1.5} />,
      path: "/tasks",
      count: openTasksCount,
    },
    {
      id: "frameworks",
      label: "Frameworks",
      icon: <Layers size={16} strokeWidth={1.5} />,
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
          icon: <FolderTree size={16} strokeWidth={1.5} />,
          path: "/overview",
          highlightPaths: ["/project-view"],
        },
        {
          id: "model-inventory",
          label: "Model inventory",
          icon: <ListIcon size={16} strokeWidth={1.5} />,
          path: "/model-inventory",
        },
        {
          id: "datasets",
          label: "Datasets",
          icon: <Database size={16} strokeWidth={1.5} />,
          path: "/datasets",
        },
        {
          id: "agent-discovery",
          label: "Agent discovery",
          icon: <Bot size={16} strokeWidth={1.5} />,
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
          icon: <AlertTriangle size={16} strokeWidth={1.5} />,
          path: "/risk-management",
        },
        {
          id: "training-registry",
          label: "Training registry",
          icon: <GraduationCap size={16} strokeWidth={1.5} />,
          path: "/training",
        },
        {
          id: "evidence",
          label: "Evidence",
          icon: <FileText size={16} strokeWidth={1.5} />,
          path: "/file-manager",
        },
        {
          id: "reporting",
          label: "Reporting",
          icon: <BarChart3 size={16} strokeWidth={1.5} />,
          path: "/reporting",
        },
        {
          id: "ai-trust-center",
          label: "AI trust center",
          icon: <Brain size={16} strokeWidth={1.5} />,
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
          icon: <Building size={16} strokeWidth={1.5} />,
          path: "/vendors",
        },
        {
          id: "policy-manager",
          label: "Policy manager",
          icon: <Shield size={16} strokeWidth={1.5} />,
          path: "/policies",
        },
        {
          id: "incident-management",
          label: "Incident management",
          icon: <AlertCircle size={16} strokeWidth={1.5} />,
          path: "/ai-incident-managements",
        },
        // {
        //   id: "approval-workflows",
        //   label: "Approval Workflows",
        //   icon: <Workflow size={16} strokeWidth={1.5} />,
        //   path: "/approval-workflows",
        // },
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
      openUserGuide={openUserGuide}
      openReleaseNotes={openReleaseNotes}
      isAdmin={isAdmin}
      enableFlyingHearts={true}
    />
  );
};

export default Sidebar;
