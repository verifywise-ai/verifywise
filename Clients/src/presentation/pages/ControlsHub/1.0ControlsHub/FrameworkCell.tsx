/**
 * FrameworkCell — compact chip cluster for a single framework column in the
 * Controls Hub matrix.
 *
 * Renders up to `maxVisible` chips showing the framework requirement title
 * (truncated) as the primary label with the code in a smaller monospace font
 * inside the tooltip. Coverage is indicated by chip border color: default for
 * full, amber for partial. An unmapped framework renders a dimmed em-dash so
 * rows stay visually aligned.
 */

import { Box, Tooltip, Typography, useTheme } from "@mui/material";

import type { MasterControlFrameworkMapping } from "../../../../domain/models/Common/masterControl/masterControl.model";

interface FrameworkCellProps {
  mappings: MasterControlFrameworkMapping[];
  /** How many chips to render inline before collapsing into "+N". */
  maxVisible?: number;
}

function chipLabel(mapping: MasterControlFrameworkMapping): string {
  // Prefer the plain-language title, truncated
  if (mapping.framework_entity_title) {
    const title = mapping.framework_entity_title;
    return title.length > 30 ? title.slice(0, 28) + "…" : title;
  }
  // Fallback to code
  if (mapping.framework_entity_code) return mapping.framework_entity_code;
  return `${mapping.framework_entity_type} #${mapping.framework_entity_id}`;
}

function tooltipLabel(mapping: MasterControlFrameworkMapping): string {
  const code =
    mapping.framework_entity_code ??
    `${mapping.framework_entity_type} #${mapping.framework_entity_id}`;
  const title = mapping.framework_entity_title;
  if (title) return `${code} — ${title}`;
  return code;
}

export default function FrameworkCell({
  mappings,
  maxVisible = 2,
}: FrameworkCellProps) {
  const theme = useTheme();

  if (!mappings || mappings.length === 0) {
    return (
      <Typography
        component="span"
        sx={{ color: theme.palette.text.disabled, fontSize: 13 }}
      >
        —
      </Typography>
    );
  }

  const visible = mappings.slice(0, maxVisible);
  const overflow = mappings.slice(maxVisible);

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 0.5,
        alignItems: "center",
      }}
    >
      {visible.map((m, idx) => {
        const label = chipLabel(m);
        const isPartial = m.coverage === "partial";
        return (
          <Tooltip
            key={m.id ?? `${m.framework_entity_type}-${m.framework_entity_id}-${idx}`}
            title={tooltipLabel(m)}
            arrow
            placement="top"
          >
            <Box
              sx={{
                padding: "2px 8px",
                borderRadius: 1,
                backgroundColor: isPartial
                  ? theme.palette.status.warning.bg
                  : theme.palette.background.alt,
                border: `1px solid ${isPartial
                  ? theme.palette.status.warning.border
                  : theme.palette.border.light}`,
                fontSize: 11,
                lineHeight: 1.4,
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Box>
          </Tooltip>
        );
      })}

      {overflow.length > 0 && (
        <Tooltip
          title={
            <Box
              component="ul"
              sx={{ margin: 0, paddingLeft: 2, fontSize: 11 }}
            >
              {overflow.map((m, idx) => (
                <li
                  key={
                    m.id ??
                    `${m.framework_entity_type}-${m.framework_entity_id}-${idx}`
                  }
                >
                  {tooltipLabel(m)}
                </li>
              ))}
            </Box>
          }
          arrow
          placement="top"
        >
          <Box
            sx={{
              padding: "2px 8px",
              borderRadius: 1,
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            +{overflow.length}
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}
