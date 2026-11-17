/**
 * Full-screen version of DemoDataLoader, for creating demo data from the
 * dashboard. It cannot be dismissed while the run is in progress, because the
 * request keeps going on the server either way.
 *
 * Built on MUI Modal, which traps focus inside the card, locks page scroll and
 * gives focus back when the overlay closes.
 */
import React from "react";
import { Box, Modal } from "@mui/material";
import { background, radiusPx } from "../../themes/palette";
import DemoDataLoader, { type DemoDataLoaderStatus } from ".";

interface DemoDataLoaderOverlayProps {
  status: DemoDataLoaderStatus;
  onExplore: () => void;
}

const DemoDataLoaderOverlay: React.FC<DemoDataLoaderOverlayProps> = ({ status, onExplore }) => (
  <Modal
    open
    disableEscapeKeyDown
    sx={{
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}
    slotProps={{
      backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(2px)" } },
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
        outline: "none",
      }}
    >
      <DemoDataLoader status={status} onExplore={onExplore} />
    </Box>
  </Modal>
);

export default DemoDataLoaderOverlay;
