/**
 * ControlsMatrix — the master × frameworks grid on the Controls Hub page.
 *
 * This file is intentionally a minimal placeholder for T-023: it accepts the
 * list of master controls and renders nothing fancier than a row count. The
 * full MUI Table implementation (sortable columns, framework chips, bulk
 * selection) lands in T-024 and replaces this stub.
 */

import { Box, Stack, Typography } from "@mui/material";
import type { MasterControlModel } from "../../../../domain/models/Common/masterControl/masterControl.model";

interface ControlsMatrixProps {
  masterControls: MasterControlModel[];
}

export function ControlsMatrix({ masterControls }: ControlsMatrixProps) {
  return (
    <Box
      sx={{
        border: (t) => `1px solid ${t.palette.divider}`,
        borderRadius: 2,
        p: 3,
      }}
    >
      <Stack gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Master controls ({masterControls.length})
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Matrix view is under construction. The full table with framework
          mappings, filters, and bulk actions lands in T-024.
        </Typography>
      </Stack>
    </Box>
  );
}
