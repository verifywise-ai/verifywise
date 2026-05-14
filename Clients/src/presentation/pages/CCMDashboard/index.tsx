import { useState, useEffect, useCallback } from "react";
import { Box, Fade } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { StatusTileCards } from "../../components/Cards/StatusTileCards";
import TabBar from "../../components/TabBar";
import Alert from "../../components/Alert";
import PageTour from "../../components/PageTour";
import CCMSteps from "./CCMSteps";
import DashboardTab from "./DashboardTab";
import ConnectorsTab from "./ConnectorsTab";
import TestsTab from "./TestsTab";
import {
  getCcmDashboard,
} from "../../../application/repository/ccm.repository";

const tabPanelStyle = {
  padding: 0,
};

const CCMDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isConnectorsPage = location.pathname.includes("/connectors");
  const isTestsPage = location.pathname.includes("/tests");
  const tabValue = isConnectorsPage ? "2" : isTestsPage ? "3" : "1";

  const [summary, setSummary] = useState({
    activeTests: 0,
    passingTests: 0,
    failingTests: 0,
    openAlerts: 0,
  });
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  const fetchSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      const data = await getCcmDashboard();
      setSummary({
        activeTests: data.activeTests,
        passingTests: data.passingTests,
        failingTests: data.failingTests,
        openAlerts: data.openAlerts,
      });
    } catch {
      setSummary({ activeTests: 0, passingTests: 0, failingTests: 0, openAlerts: 0 });
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (alert) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    if (newValue === "1") navigate("/continuous-monitoring");
    else if (newValue === "2") navigate("/continuous-monitoring/connectors");
    else if (newValue === "3") navigate("/continuous-monitoring/tests");
  };

  const handleAlert = (variant: "success" | "error" | "info", title: string) => {
    setAlert({ variant, title });
  };

  const summaryItems = [
    { key: "active", label: "Active", count: summary.activeTests, color: "#2196F3" },
    { key: "passing", label: "Passing", count: summary.passingTests, color: "#4CAF50" },
    { key: "failing", label: "Failing", count: summary.failingTests, color: "#F44336" },
    { key: "alerts", label: "Alerts", count: summary.openAlerts, color: "#FF9800" },
  ];

  return (
    <PageHeaderExtended
      title={
        tabValue === "1"
          ? "Continuous Control Monitoring"
          : tabValue === "2"
            ? "Connectors"
            : "Control Tests"
      }
      description={
        tabValue === "1"
          ? "Automated control testing, connector health, and alerting dashboard."
          : tabValue === "2"
            ? "Manage data connectors for automated control testing."
            : "Configure and manage automated control tests."
      }
      helpArticlePath="ai-governance/continuous-monitoring"
      tipBoxEntity="continuous-monitoring"
      summaryCards={
        <Box data-joyride-id="ccm-status-cards">
          <StatusTileCards
            items={summaryItems}
            entityName="test"
            size="small"
          />
        </Box>
      }
      summaryCardsJoyrideId="ccm-status-cards"
      alert={
        alert ? (
          <Fade in={showAlert} timeout={300}>
            <Box sx={{ position: "fixed", zIndex: 9999 }}>
              <Alert
                variant={alert.variant}
                title={alert.title}
                isToast
                onClick={() => {
                  setShowAlert(false);
                  setTimeout(() => setAlert(null), 300);
                }}
              />
            </Box>
          </Fade>
        ) : undefined
      }
    >
      <PageTour steps={CCMSteps} />

      <TabContext value={tabValue}>
        <Box data-joyride-id="ccm-tab-bar" sx={{ mb: 2 }}>
          <TabBar
            tabs={[
              {
                label: "Dashboard",
                value: "1",
                icon: "LayoutDashboard",
                tooltip: "Overview of monitoring health, alerts, and results",
              },
              {
                label: "Connectors",
                value: "2",
                icon: "Plug",
                tooltip: "Manage data connectors",
              },
              {
                label: "Tests",
                value: "3",
                icon: "FlaskConical",
                tooltip: "Configure automated control tests",
              },
            ]}
            activeTab={tabValue}
            onChange={handleTabChange}
          />
        </Box>

        <TabPanel value="1" sx={tabPanelStyle}>
          <DashboardTab onAlert={handleAlert} />
        </TabPanel>

        <TabPanel value="2" sx={tabPanelStyle}>
          <ConnectorsTab onAlert={handleAlert} />
        </TabPanel>

        <TabPanel value="3" sx={tabPanelStyle}>
          <TestsTab onAlert={handleAlert} />
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
};

export default CCMDashboard;
