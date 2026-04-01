import { Stack, Typography, Tooltip, Box } from "@mui/material";
import {
  projectRisksCard,
  projectRisksTileCard,
  projectRisksTileCardKey,
  projectRisksTileCardvalue,
} from "../RisksCard/style";
import { border as borderPalette } from "../../../themes/palette";

export interface StatusTileItem {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface StatusTileCardsProps {
  items: StatusTileItem[];
  /** Optional: custom tooltip format. Default: "{count} {label}" */
  tooltipFormat?: (item: StatusTileItem) => string;
  /** Optional: entity name for pluralization in tooltip (e.g., "task", "model") */
  entityName?: string;
  /** Optional: custom styles to override individual card styling */
  cardSx?: Record<string, unknown>;
  /** Optional: callback when a card is clicked */
  onCardClick?: (key: string) => void;
  /** Optional: key of the currently selected card */
  selectedKey?: string | null;
  /** Optional: card size variant. "small" uses compact dimensions. Default: "original" */
  size?: "small" | "original";
}

export function StatusTileCards({
  items,
  tooltipFormat,
  entityName = "item",
  cardSx,
  onCardClick,
  selectedKey,
  size = "original",
}: StatusTileCardsProps) {
  const isSmall = size === "small";

  const sizeOverrides = isSmall
    ? {
        flex: { xs: "1 1 80px", sm: "0 0 100px" },
        width: { sm: "100px" },
        height: { sm: "76px" },
        paddingY: { xs: "6px", sm: "10px" },
        paddingX: { xs: "10px", sm: "12px" },
        gap: 2,
      }
    : {};
  const getTooltip = (item: StatusTileItem): string => {
    if (tooltipFormat) {
      return tooltipFormat(item);
    }
    const pluralize = (name: string, count: number): string => {
      if (count === 1) return name;
      if (name.endsWith("y")) return name.slice(0, -1) + "ies";
      return name + "s";
    };
    return `${item.count} ${item.label.toLowerCase()} ${pluralize(entityName, item.count)}`;
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Stack className="vw-status-tile-cards" sx={{ ...projectRisksCard, ...(isSmall ? { gap: "10px" } : {}) }}>
        {items.map((item) => (
          <Tooltip
            key={item.key}
            title={getTooltip(item)}
            arrow
            placement="top"
          >
            <Stack
              className="vw-status-tile"
              sx={{
                ...projectRisksTileCard,
                ...sizeOverrides,
                color: item.color,
                border: selectedKey === item.key ? `1px solid ${item.color}` : `1px solid ${borderPalette.dark}`,
                cursor: onCardClick ? "pointer" : "default",
                background: selectedKey === item.key ? "rgba(146, 247, 224, 0.08)" : undefined,
                ...cardSx,
              }}
              onClick={() => onCardClick?.(item.key)}
            >
              <Typography sx={{ ...projectRisksTileCardKey, ...(isSmall ? { fontSize: 11 } : {}) }}>{item.label}</Typography>
              <Typography sx={{ ...projectRisksTileCardvalue, ...(isSmall ? { fontSize: 22 } : {}) }}>{item.count}</Typography>
            </Stack>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}
