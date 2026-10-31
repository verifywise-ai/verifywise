/**
 * VendorResearchButton - Row action of the vendors table that starts a research run for a vendor
 *
 * Shown only to users who may edit vendors (`vendor.edit`). It is disabled while the research
 * settings are on their way, and when they say research is not set up (the organization has no
 * LLM key), in which case its tooltip says so. If the request for the settings fails,
 * the button is enabled and the server decides: a start without them is refused with a 409.
 * Every click is answered with a message handed to `onNotify`, whatever the outcome: the global
 * error toast is off for this call, so nothing else tells the user. The run itself is followed on
 * the Risks tab, not here: a run that was started, or that the vendor already had, leaves its
 * vendor for the findings section there, which opens on it and reads the run to its end. A
 * refused start leaves nothing.
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
import { useQueryClient } from "@tanstack/react-query";
import { Box, IconButton, alpha } from "@mui/material";
import { Microscope } from "lucide-react";
import VWTooltip from "../VWTooltip";
import { brand, text } from "../../themes/palette";
import { useHasPermission } from "../../../application/hooks/useMyPermissions";
import {
  followResearch,
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
  const queryClient = useQueryClient();

  // While the settings are on their way the button is disabled and has no tooltip: "not set up"
  // would only be a guess. Once they are in, they decide. If the request for them has failed for
  // good, the server decides, as in the findings section, which takes that as "set up": a start
  // without the settings is refused with a 409, and the message says "not set up".
  const settingsPending = config.isPending;
  const notSetUp = config.data !== undefined && !config.data.hasLlmKey;

  const handleClick = async (event: React.MouseEvent) => {
    // The row this button sits in opens its vendor when it is clicked.
    event.stopPropagation();
    try {
      const started = await start.mutateAsync(vendorId);
      // Not in the start hook: the findings section starts runs through it too, and is on screen.
      followResearch(queryClient, vendorId);
      onNotify(alertForStarted(started, vendorName));
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
        disabled={settingsPending || notSetUp || start.isPending}
        onClick={(event) => void handleClick(event)}
        sx={{
          "width": "30px",
          "height": "30px",
          "color": `${text.icon}`,
          "&:hover": {
            color: `${brand.primary}`,
            backgroundColor: alpha(brand.primary, 0.08),
          },
        }}
      >
        <Microscope size={16} />
      </IconButton>
    </Box>
  );

  if (settingsPending) return button;
  return (
    <VWTooltip
      content={notSetUp ? "Vendor research is not set up." : "Research risks"}
      maxWidth={200}
    >
      {button}
    </VWTooltip>
  );
};

const VendorResearchButton: React.FC<VendorResearchButtonProps> = (props) => {
  const canEdit = useHasPermission("vendor.edit");
  return canEdit ? <StartResearchButton {...props} /> : null;
};

export default VendorResearchButton;
