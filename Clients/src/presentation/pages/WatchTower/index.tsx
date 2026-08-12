import { useState } from "react";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import WatchTowerEvents from "./Events";
import WatchTowerLogs from "./Loggings";
import { useLocation, useNavigate } from "react-router";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";

const tabPanelStyle = {
  padding: 0,
};

const WatchTower = () => {
  const location = useLocation();
  const navigate = useNavigate();

  //tab from URL - derive directly from URL state
  const isLogsPage = location.pathname.includes("/logs");
  const tabValue = isLogsPage ? "2" : "1";

  // Keep local state only for controlled component behavior during navigation
  const [, setValue] = useState(tabValue);

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
    if (newValue === "1") navigate("/event-tracker");
    else if (newValue === "2") navigate("/event-tracker/logs");
  };

  return (
    <PageHeaderExtended
      title="Event Tracker"
      description="Event Tracker gives you a live window into VerifyWise. It records
        every user action and system event, then lets you dive into the raw
        logs for deeper troubleshooting. Use it to see who did what, spot
        patterns, and keep your application healthy"
      helpArticlePath="ai-governance/watchtower"
      tipBoxEntity="event-tracker"
    >
      <TabContext value={tabValue}>
        <TabBar
          tabs={[
            {
              label: "Events",
              value: "1",
              icon: "Calendar",
              tooltip: "Tracked events across your organization",
            },
            {
              label: "Logs",
              value: "2",
              icon: "FileText",
              tooltip: "Detailed system and audit logs",
            },
          ]}
          activeTab={tabValue}
          onChange={handleChange}
        />

        <TabPanel value="1" sx={tabPanelStyle}>
          <WatchTowerEvents />
        </TabPanel>

        <TabPanel value="2" sx={tabPanelStyle}>
          <WatchTowerLogs />
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
};

export default WatchTower;
