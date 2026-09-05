import { Box, Stack, Typography } from "@mui/material";
import Chip from "../../components/Chip";
import { IRoadmapTool, RoadmapToolStatus } from "../../../domain/interfaces/i.advisorRoadmap";
import { toolCardStyle, toolDescriptionStyle, toolNameStyle } from "./style";
import { ChipVariant } from "../../types/interfaces/i.chip";

const STATUS_CHIP_VARIANT: Record<RoadmapToolStatus, ChipVariant> = {
  implemented: "success",
  planned: "warning",
  renamed: "info",
};

const STATUS_LABEL: Record<RoadmapToolStatus, string> = {
  implemented: "Implemented",
  planned: "Planned",
  renamed: "Renamed",
};

interface RoadmapToolCardProps {
  tool: IRoadmapTool;
}

/**
 * Read-only roadmap card for a single planned tool. Shows catalogue
 * metadata only (name, domain, kind, status) — never tool definitions or
 * write-action details.
 */
export default function RoadmapToolCard({ tool }: RoadmapToolCardProps) {
  return (
    <Stack sx={toolCardStyle}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{tool.label}</Typography>
        <Chip
          label={STATUS_LABEL[tool.status]}
          variant={STATUS_CHIP_VARIANT[tool.status]}
          size="small"
        />
      </Stack>
      <Typography sx={toolNameStyle}>{tool.name}</Typography>
      {tool.status === "renamed" && tool.implementedAs && (
        <Typography sx={toolDescriptionStyle}>Implemented as {tool.implementedAs}</Typography>
      )}
      <Typography sx={toolDescriptionStyle}>{tool.description || tool.label}</Typography>
      <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Chip label={tool.domain} variant="default" size="small" uppercase={false} />
        <Chip
          label={tool.kind === "write" ? "Write" : "Read"}
          variant={tool.kind === "write" ? "info" : "default"}
          size="small"
        />
      </Box>
    </Stack>
  );
}
