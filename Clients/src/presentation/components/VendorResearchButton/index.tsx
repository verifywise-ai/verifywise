/**
 * VendorResearchButton - Row action of the vendors table that starts a research run for a vendor
 *
 * Shown only to users who may edit risks (`risks.edit`). It works once the server says research
 * is set up (a search provider and an LLM key); until then it is disabled, and it says why once
 * the settings are known. Every click is answered with a message handed to `onNotify`, whatever
 * the outcome: the global error toast is off for this call, so nothing else tells the user. The
 * run itself is followed on the Risks tab, not here.
 *
 * Mount it with `key={vendorId}` where rows can change order, so that a start still in flight
 * for one vendor does not disable the button of the vendor that takes its place.
 *
 * Usage:
 * <VendorResearchButton
 *   vendorId={vendor.id}
 *   vendorName={vendor.vendor_name}
 *   onNotify={showAlert}
 * />
 */

import React from "react";
import { Box, IconButton } from "@mui/material";
import { Microscope } from "lucide-react";
import VWTooltip from "../VWTooltip";
import { brand, text } from "../../themes/palette";
import { useHasPermission } from "../../../application/hooks/useMyPermissions";
import {
  useStartVendorResearch,
  useVendorResearchConfig,
} from "../../../application/hooks/useVendorResearch";
import {
  alertForStartFailure,
  alertForStarted,
  type ResearchAlert,
} from "../../../application/utils/vendorResearchAlerts";

interface VendorResearchButtonProps {
  vendorId: number;
  vendorName: string;
  /** Receives the message that answers a click: started, already running, or why it failed. */
  onNotify: (alert: ResearchAlert) => void;
}

/** The button of a user who may start research. Only this reads the settings and holds the request. */
const StartResearchButton: React.FC<VendorResearchButtonProps> = ({
  vendorId,
  vendorName,
  onNotify,
}) => {
  const config = useVendorResearchConfig();
  const start = useStartVendorResearch();

  // Nothing starts before the server has said that it can: while the settings are loading, the
  // button is disabled and has no tooltip, because "not set up" would only be a guess.
  const settingsKnown = config.data !== undefined;
  const setUp = config.data !== undefined && config.data.searchConfigured && config.data.hasLlmKey;

  const handleClick = async (event: React.MouseEvent) => {
    // The row this button sits in opens its vendor when it is clicked.
    event.stopPropagation();
    try {
      onNotify(alertForStarted(await start.mutateAsync(vendorId), vendorName));
    } catch (error) {
      // The global error toast is off for this call: every failure is answered here.
      onNotify(alertForStartFailure(error));
    }
  };

  // A disabled button gets no pointer events, so the span carries the tooltip. It is inline-flex
  // so that it takes the size of the button and does not change the row's alignment.
  const button = (
    <Box component="span" sx={{ display: "inline-flex" }}>
      <IconButton
        aria-label="Research risks"
        size="small"
        disabled={!setUp || start.isPending}
        onClick={(event) => void handleClick(event)}
        sx={{
          "width": "30px",
          "height": "30px",
          "color": `${text.icon}`,
          "&:hover": {
            color: `${brand.primary}`,
            backgroundColor: "rgba(19, 113, 91, 0.08)",
          },
        }}
      >
        <Microscope size={16} />
      </IconButton>
    </Box>
  );

  if (!settingsKnown) return button;
  return (
    <VWTooltip content={setUp ? "Research risks" : "Vendor research is not set up."} maxWidth={200}>
      {button}
    </VWTooltip>
  );
};

const VendorResearchButton: React.FC<VendorResearchButtonProps> = (props) => {
  const canEdit = useHasPermission("risks.edit");
  return canEdit ? <StartResearchButton {...props} /> : null;
};

export default VendorResearchButton;
