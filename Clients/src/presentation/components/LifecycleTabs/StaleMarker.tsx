import { Box } from "@mui/material";
import StatusBadge from "../StatusBadge";
import VWTooltip from "../VWTooltip";

/**
 * "Stale" marker for a live entry nobody confirmed within the org's
 * "still live?" interval (#5187). Shared by the use case table and cards and,
 * later, AI apps.
 */
const StaleMarker = () => (
  <VWTooltip content="Not confirmed as live within the check interval set for your organization. The owner has been asked to confirm it or retire it.">
    <Box
      component="span"
      data-testid="lifecycle-stale-marker"
      sx={{ display: "inline-flex", ml: "8px", verticalAlign: "middle" }}
    >
      <StatusBadge label="Stale" variant="warning" size="small" uppercase={false} />
    </Box>
  </VWTooltip>
);

export default StaleMarker;
