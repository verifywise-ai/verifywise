import { useEffect, useState } from "react";
import { Stack } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import WatchTowerEvents from "./Events";
import WatchTowerLogs from "./Loggings";
import { useLocation, useNavigate } from "react-router";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import CustomizableSkeleton from "../../components/Skeletons";
import { useHasPermission, useMyPermissions } from "../../../application/hooks/useMyPermissions";

const tabPanelStyle = {
  padding: 0,
};

// One wording for every member, so the header never changes once the
// permissions arrive. The Logs tab (Admin only) carries its own tooltip.
const DESCRIPTION =
  "Event Tracker gives you a live window into VerifyWise. It records every user action and system event. Use it to see who did what, spot patterns, and keep your application healthy.";

const WatchTower = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Server logs are Admin-only (logs.admin). /event-tracker renders the
  // Events tab straight away; the Logs tab joins it once the permissions say
  // so. Only /event-tracker/logs waits for them: an allowed user then gets
  // Logs, anyone else is replaced to /event-tracker, so the logs request is
  // never made for them.
  const { isLoading: permissionsLoading } = useMyPermissions();
  const canViewLogs = useHasPermission("logs.admin", { fallbackToAdmin: true });

  //tab from URL - derive directly from URL state
  const isLogsPage = location.pathname.includes("/logs");
  const tabValue = isLogsPage && canViewLogs ? "2" : "1";
  const redirectToEvents = !permissionsLoading && isLogsPage && !canViewLogs;

  useEffect(() => {
    if (redirectToEvents) navigate("/event-tracker", { replace: true });
  }, [redirectToEvents, navigate]);

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
      description={DESCRIPTION}
      helpArticlePath="ai-governance/watchtower"
      tipBoxEntity="event-tracker"
    >
      {(isLogsPage && permissionsLoading) || redirectToEvents ? (
        <Stack data-testid="event-tracker-loading" sx={{ gap: "8px" }}>
          <CustomizableSkeleton variant="rectangular" width="100%" height={34} />
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        </Stack>
      ) : (
        <TabContext value={tabValue}>
          <TabBar
            tabs={[
              {
                label: "Events",
                value: "1",
                icon: "Calendar",
                tooltip: "Tracked events across your organization",
              },
              ...(canViewLogs
                ? [
                    {
                      label: "Logs",
                      value: "2",
                      icon: "FileText" as const,
                      tooltip: "Detailed system and audit logs",
                    },
                  ]
                : []),
            ]}
            activeTab={tabValue}
            onChange={handleChange}
          />

          <TabPanel value="1" sx={tabPanelStyle}>
            <WatchTowerEvents />
          </TabPanel>

          {canViewLogs && (
            <TabPanel value="2" sx={tabPanelStyle}>
              <WatchTowerLogs />
            </TabPanel>
          )}
        </TabContext>
      )}
    </PageHeaderExtended>
  );
};

export default WatchTower;
