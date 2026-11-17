/**
 * Full-screen version of DemoDataLoader, for creating demo data from the
 * dashboard. It cannot be dismissed while the run is in progress, because the
 * request keeps going on the server either way.
 */
import React from "react";
import { Box } from "@mui/material";
import { background, radiusPx } from "../../themes/palette";
import DemoDataLoader, { type DemoDataLoaderStatus } from ".";

interface DemoDataLoaderOverlayProps {
  status: DemoDataLoaderStatus;
  onExplore: () => void;
}

const DemoDataLoaderOverlay: React.FC<DemoDataLoaderOverlayProps> = ({ status, onExplore }) => (
  <Box
    sx={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(2px)",
    }}
  >
    <Box
      role="dialog"
      aria-modal="true"
      aria-label="Creating demo data"
      sx={{
        width: "100%",
        maxWidth: "660px",
        backgroundColor: background.main,
        borderRadius: radiusPx.xl,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)",
        overflow: "hidden",
      }}
    >
      <DemoDataLoader status={status} onExplore={onExplore} />
    </Box>
  </Box>
);

export default DemoDataLoaderOverlay;
