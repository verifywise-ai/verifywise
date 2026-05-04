import { useState, type SyntheticEvent } from "react";
import TabPanel from "@mui/lab/TabPanel";
import TabContext from "@mui/lab/TabContext";
import { useNavigate, useParams } from "react-router-dom";
import { Settings } from "lucide-react";
import TabBar, { TabItem } from "../../../components/TabBar";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Profile from "../../SettingsPage/Profile";
import Password from "../../SettingsPage/Password";

export default function SuperAdminSettings() {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState(tab || "profile");

  const breadcrumbItems = [
    {
      label: "Settings",
      icon: <Settings size={14} />,
      ...(tab ? { path: "/super-admin/settings" } : {}),
    },
    ...(tab ? [{ label: tab.charAt(0).toUpperCase() + tab.slice(1) }] : []),
  ];

  const handleTabChange = (_: SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
    if (newValue === "profile") navigate("/super-admin/settings");
    else navigate(`/super-admin/settings/${newValue}`);
  };

  return (
    <PageHeaderExtended
      title="Settings"
      description="Manage your super admin profile and security."
      breadcrumbItems={breadcrumbItems}
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            {
              label: "Profile",
              value: "profile",
              icon: "User" as TabItem["icon"],
              tooltip: "Your name, email and personal details",
            },
            {
              label: "Password",
              value: "password",
              icon: "Lock" as TabItem["icon"],
              tooltip: "Update your account password",
            },
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
        />

        <TabPanel sx={{ p: 0 }} value="profile">
          <Profile />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="password">
          <Password />
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
}
