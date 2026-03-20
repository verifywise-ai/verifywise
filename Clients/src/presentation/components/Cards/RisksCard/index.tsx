import { Stack, Typography, Tooltip, Box } from "@mui/material";
import { TrendingUp as TrendingUpRedIcon, TrendingDown as TrendingDownGreenIcon, Minus as TrendingFlatGreyIcon } from "lucide-react";
import {
  projectRisksCard,
  projectRisksTileCard,
  projectRisksTileCardKey,
  projectRisksTileCardvalue,
  trendIndicator,
  trendIconUp,
  trendIconDown,
  trendIconStable,
} from "./style";
import { risksSummary, EnhancedRiskSummary, RiskTrend } from "../../../../domain/interfaces/i.riskSummary";
import { status, border as borderPalette } from "../../../themes/palette";

interface RisksCardProps {
  risksSummary: risksSummary | EnhancedRiskSummary;
  onCardClick?: (riskLevel: string) => void;
  selectedLevel?: string | null;
}

export function RisksCard({ risksSummary, onCardClick, selectedLevel }: RisksCardProps) {
  const getValidRiskValue = (value: number) => (isNaN(value) ? 0 : value);

  const renderTrendIndicator = (trend?: RiskTrend) => {
    if (!trend || trend.direction === 'stable') {
      return (
        <Typography sx={trendIndicator}>
          <TrendingFlatGreyIcon size={16} style={trendIconStable} />
          <span style={{ color: `${status.default.text}` }}>
            {trend?.change === 0 ? "0" : "—"}
          </span>
        </Typography>
      );
    }

    if (trend.direction === 'up') {
      return (
        <Typography sx={trendIndicator}>
          <TrendingUpRedIcon size={16} style={trendIconUp} />
          <span style={{ color: "#EF4444" }}>
            +{trend.change}
          </span>
        </Typography>
      );
    }

    return (
      <Typography sx={trendIndicator}>
        <TrendingDownGreenIcon size={16} style={trendIconDown} />
        <span style={{ color: "#10B981" }}>
          -{Math.abs(trend.change)}
        </span>
      </Typography>
    );
  };

  const getTrendTooltip = (trend: RiskTrend | undefined, level: string) => {
    if (!trend) return "";
    const direction = trend.direction === 'up' ? 'increased' : 
                     trend.direction === 'down' ? 'decreased' : 'remained stable';
    return `${level} risks have ${direction} by ${Math.abs(trend.change)} this ${trend.period}`;
  };

  const enhancedSummary = risksSummary as EnhancedRiskSummary;

  const handleCardClick = (levelLabel: string) => {
    if (onCardClick) {
      // Clear filter if "Total" clicked or same level clicked again
      if (levelLabel === 'Total' || selectedLevel === levelLabel) {
        onCardClick('');
      } else {
        onCardClick(levelLabel);
      }
    }
  };

  const riskLevels = [
    {
      key: "total",
      label: "Total",
      value: risksSummary.total,
      color: "#4B5563",
      trend: undefined,
    },
    {
      key: "veryHigh",
      label: "Very high",
      value: risksSummary.veryHighRisks,
      color: "#C63622",
      trend: enhancedSummary.trends?.veryHighTrend,
    },
    {
      key: "high",
      label: "High",
      value: risksSummary.highRisks,
      color: "#D68B61",
      trend: enhancedSummary.trends?.highTrend,
    },
    {
      key: "medium",
      label: "Medium",
      value: risksSummary.mediumRisks,
      color: "#D6B971",
      trend: enhancedSummary.trends?.mediumTrend,
    },
    {
      key: "low",
      label: "Low",
      value: risksSummary.lowRisks,
      color: "#52AB43",
      trend: enhancedSummary.trends?.lowTrend,
    },
    {
      key: "veryLow",
      label: "Very low",
      value: risksSummary.veryLowRisks,
      color: "#B8D39C",
      trend: enhancedSummary.trends?.veryLowTrend,
    },
  ];

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

      <Stack className="vw-project-risks" sx={{ ...projectRisksCard, flex: 1 }}>
        {riskLevels.map((level) => {
          const isSelected = selectedLevel === level.label;
          const isClickable = !!onCardClick;

          return (
            <Tooltip
              key={level.key}
              title={getTrendTooltip(level.trend, level.label)}
              arrow
              placement="top"
            >
              <Stack
                className="vw-project-risks-tile"
                onClick={() => handleCardClick(level.label)}
                sx={{
                  ...projectRisksTileCard,
                  color: level.color,
                  cursor: isClickable ? 'pointer' : 'default',
                  border: isSelected ? `1px solid ${level.color}` : `1px solid ${borderPalette.dark}`,
                  background: isSelected ? 'rgba(146, 247, 224, 0.08)' : undefined,
                }}
              >
                <Typography sx={projectRisksTileCardKey}>{level.label}</Typography>
                <Typography sx={projectRisksTileCardvalue}>
                  {getValidRiskValue(level.value)}
                </Typography>
                {level.trend && renderTrendIndicator(level.trend)}
              </Stack>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}
