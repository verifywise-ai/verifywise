/**
 * FrameworkCell — compact chip cluster for a single framework column in the
 * Controls Hub matrix.
 *
 * Renders up to `maxVisible` chips showing the framework requirement codes
 * (or a synthesized `type #id` label when a code isn't available). When more
 * mappings exist, a trailing "+N" chip shows the remainder — hovering it
 * reveals the full list. An unmapped framework renders a dimmed em-dash so
 * rows stay visually aligned.
 */

import { Box, Tooltip, Typography, useTheme } from "@mui/material";

import type { MasterControlFrameworkMapping } from "../../../../domain/models/Common/masterControl/masterControl.model";

interface FrameworkCellProps {
  mappings: MasterControlFrameworkMapping[];
  /** How many chips to render inline before collapsing into "+N". */
  maxVisible?: number;
}

function labelForMapping(mapping: MasterControlFrameworkMapping): string {
  if (mapping.framework_entity_code) return mapping.framework_entity_code;
  return `${mapping.framework_entity_type} #${mapping.framework_entity_id}`;
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
        const label = labelForMapping(m);
        const title = m.framework_entity_title ?? label;
        return (
          <Tooltip
            key={m.id ?? `${m.framework_entity_type}-${m.framework_entity_id}-${idx}`}
            title={title}
            arrow
            placement="top"
          >
            <Box
              sx={{
                padding: "2px 8px",
                borderRadius: 1,
                backgroundColor: theme.palette.background.alt,
                border: `1px solid ${theme.palette.border.light}`,
                fontSize: 11,
                fontFamily: "monospace",
                lineHeight: 1.4,
                maxWidth: 140,
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
                  {m.framework_entity_title
                    ? `${labelForMapping(m)} — ${m.framework_entity_title}`
                    : labelForMapping(m)}
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
