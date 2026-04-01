import React from "react";
import { useLocation, useNavigate } from "react-router";
import { Building, Users } from "lucide-react";
import SidebarShell, { SidebarMenuItem } from "../Sidebar/SidebarShell";

const SuperAdminSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
