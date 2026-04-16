/**
 * Controls Hub — Unified Cross-Framework Controls Library.
 *
 * This file is the lazy-loaded entry point referenced from
 * `application/config/routes.tsx`. The shell wires state and providers;
 * the actual matrix UI lives in `ControlsMatrix.tsx` (added in T-024).
 *
 * This file is intentionally minimal for T-019; T-023 will flesh out
 * loading/empty/error states and T-024 will add the data table.
 */

import { Box, Typography } from "@mui/material";

export default function ControlsHub() {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
        Controls Hub
      </Typography>
      <Typography variant="body1" sx={{ color: "text.secondary" }}>
        Manage master controls and their mappings to EU AI Act, ISO 42001,
        ISO 27001, and NIST AI RMF framework requirements.
      </Typography>
    </Box>
  );
}
