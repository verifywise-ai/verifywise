import { useState } from "react";
import { Box, Fade } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../../components/TabBar";
import Alert from "../../../components/Alert";
import { toastFadeStyle } from "../style";
import { MrmUser } from "./types";
import OverviewTab from "./OverviewTab";
import TieringTab from "./TieringTab";
import ValidationTab from "./ValidationTab";
import FindingsTab from "./FindingsTab";
import MonitoringTab from "./MonitoringTab";
import SettingsTab from "./SettingsTab";

interface ModelRiskManagementTabProps {
  users: MrmUser[];
}

type MrmSubTab = "overview" | "tiering" | "validation" | "findings" | "monitoring" | "settings";

interface MrmToast {
  variant: "success" | "error" | "info";
  body: string;
}

const ModelRiskManagementTab = ({ users }: ModelRiskManagementTabProps) => {
  const [subTab, setSubTab] = useState<MrmSubTab>("overview");
  const [toast, setToast] = useState<MrmToast | null>(null);
  const [showToast, setShowToast] = useState(false);

  const surface = (variant: MrmToast["variant"], body: string) => {
    setToast({ variant, body });
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      setTimeout(() => setToast(null), 300);
    }, 4000);
  };

  const onError = (body: string) => surface("error", body);
  const onSuccess = (body: string) => surface("success", body);

  return (
    <Box>
      {toast && (
        <Fade in={showToast} timeout={300} style={toastFadeStyle}>
          <Box sx={{ marginBottom: "16px" }}>
            <Alert
              variant={toast.variant}
              body={toast.body}
              isToast
              onClick={() => {
                setShowToast(false);
                setTimeout(() => setToast(null), 300);
              }}
            />
          </Box>
        </Fade>
      )}

      <TabContext value={subTab}>
        <Box sx={{ marginBottom: "24px" }}>
          <TabBar
            tabs={[
              { label: "Overview", value: "overview", icon: "LayoutDashboard" },
              { label: "Tiering", value: "tiering", icon: "Layers" },
              { label: "Validation", value: "validation", icon: "ClipboardCheck" },
              { label: "Findings", value: "findings", icon: "Flag" },
              { label: "Monitoring", value: "monitoring", icon: "Activity" },
              { label: "Settings", value: "settings", icon: "Settings" },
            ]}
            activeTab={subTab}
            onChange={(_e, value) => setSubTab(value as MrmSubTab)}
            dataJoyrideId="mrm-sub-tabs"
          />
        </Box>
      </TabContext>

      {subTab === "overview" && <OverviewTab onError={onError} onSuccess={onSuccess} />}
      {subTab === "tiering" && <TieringTab onError={onError} onSuccess={onSuccess} />}
      {subTab === "validation" && (
        <ValidationTab users={users} onError={onError} onSuccess={onSuccess} />
      )}
      {subTab === "findings" && (
        <FindingsTab users={users} onError={onError} onSuccess={onSuccess} />
      )}
      {subTab === "monitoring" && <MonitoringTab onError={onError} onSuccess={onSuccess} />}
      {subTab === "settings" && (
        <SettingsTab users={users} onError={onError} onSuccess={onSuccess} />
      )}
    </Box>
  );
};

export default ModelRiskManagementTab;
