import React, { useEffect } from "react";
import Overview from "./Overview";
import Resources from "./Resources";
import Subprocessors from "./Subprocessors";
import { Box,Stack } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import Tab from "@mui/material/Tab";
import {
  aiTrustCenterTabStyle,
  aiTrustCenterTabPanelStyle,
  aiTrustCenterTabListStyle,
} from "./style";
import AITrustCentreHeader from "./Components/Header/AITrustCentreHeader";
import axios from "axios";
import { useParams } from "react-router-dom";
import { ENV_VARs } from "../../../../env.vars";

const AITrustCentrePublic: React.FC = () => {
  const [tabValue, setTabValue] = React.useState("overview");
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hash, setHash] = React.useState<string | null>(null);
  const params = useParams();

  useEffect(() => {
    const hash = params.hash || null;
    setHash(hash);
  }, [params]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => setTabValue(newValue);

  React.useEffect(() => {
    if (!hash) return;
    setLoading(true);
    setError(null);
    axios.get(`${ENV_VARs.URL}/api/aiTrustCentre/${hash}`)
      .then((response) => {
        if (response?.data) {
          setData(response?.data?.data?.trustCentre);
        }
      })
      .catch((err) => {
          setError(err?.response?.data?.error || err.message || 'Failed to fetch ai trust center data');
      })
      .finally(() => {
        setLoading(false);
      });
    return () => {
    
    };
  }, [hash]);


  return (
    <Stack
      overflow={"hidden"}
      sx={{
        backgroundColor: "#FCFCFD",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: 180,
          background: data?.info?.header_color || '#D6E4F9',
          position: "relative",
          px: 10,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -55, 
            display: "flex",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <AITrustCentreHeader data={data} hash={hash} />
        </Box>
      </Box>
      {/* Tabs */}
      <Stack alignItems="start" sx={{ mt: 16, width: "80%" }}>
        <TabContext value={tabValue}>
          <Box
            sx={{
              borderBottom: 1,
              borderColor: "divider",
              minWidth: 320,
              display: "flex",
              justifyContent: "flex-start",
              width: "100%",
            }}
          >
            <TabList
              onChange={handleTabChange}
              TabIndicatorProps={{ style: { backgroundColor: "brand.primary" } }}
              aria-label="AI Trust Center Public Tabs"
              sx={aiTrustCenterTabListStyle}
            >
              <Tab
                label="Overview"
                value="overview"
                disableRipple
                sx={aiTrustCenterTabStyle}
              />
              <Tab
                label="Resources"
                value="resources"
                disableRipple
                sx={aiTrustCenterTabStyle}
              />
              <Tab
                label="Subprocessors"
                value="subprocessors"
                disableRipple
                sx={aiTrustCenterTabStyle}
              />
            </TabList>
          </Box>
          <TabPanel value="overview" sx={aiTrustCenterTabPanelStyle}>
            <Overview data={data} loading={loading} error={error} onShowAllResources={() => setTabValue("resources")} hash={hash} />
          </TabPanel>
          <TabPanel value="resources" sx={aiTrustCenterTabPanelStyle}>
            <Resources data={data} loading={loading} error={error} hash={hash} />
          </TabPanel>
          <TabPanel value="subprocessors" sx={aiTrustCenterTabPanelStyle}>
            <Subprocessors data={data} loading={loading} error={error} />
          </TabPanel>
        </TabContext>
      </Stack>
    </Stack>
  );
};

export default AITrustCentrePublic;
