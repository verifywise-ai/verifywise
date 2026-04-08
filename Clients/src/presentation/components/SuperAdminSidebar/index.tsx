import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { Building, Users } from "lucide-react";
import SidebarShell, { SidebarMenuItem } from "../Sidebar/SidebarShell";
import { getUserCount } from "../../../application/repository/superAdmin.repository";

const SuperAdminSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userCount, setUserCount] = useState<number>(0);

  const fetchUserCount = useCallback(async () => {
    try {
      const response = await getUserCount();
      const serverData = response.data as any;
      setUserCount(serverData?.data?.count ?? 0);
    } catch {
      // Silently fail — count will show 0
    }
  }, []);

  useEffect(() => {
    fetchUserCount();
  }, [fetchUserCount]);

  const topItems: SidebarMenuItem[] = [
    {
      id: "organizations",
      label: "Organizations",
      icon: <Building size={16} strokeWidth={1.5} />,
      path: "/super-admin",
    },
    {
      id: "users",
      label: "Users",
      icon: <Users size={16} strokeWidth={1.5} />,
      path: "/super-admin/users",
      count: userCount,
    },
  ];

  const isItemActive = (item: SidebarMenuItem): boolean => {
    if (item.path === "/super-admin") {
      return location.pathname === "/super-admin" || location.pathname.startsWith("/super-admin/organizations");
    }
    if (item.path) {
      return location.pathname === item.path;
    }
    return false;
  };

  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <SidebarShell
      topItems={topItems}
      menuGroups={[]}
      isItemActive={isItemActive}
      onItemClick={handleItemClick}
    />
  );
};

export default SuperAdminSidebar;
