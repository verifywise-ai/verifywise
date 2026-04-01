import { useState } from "react";
import { Stack, Typography } from "@mui/material";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { vwTooltipStyle, ChartOutlineWrapper } from "../../Charts/VWCharts";
import { text, background, border as borderPalette } from "../../../themes/palette";

interface TaskRadarCardProps {
  overdue: number;
  due: number;
  upcoming: number;
}

const BAR_COLORS: Record<string, string> = {
  Overdue: "#EF4444",
  "Due soon": "#F59E0B",
  Upcoming: "#10B981",
};

export function TaskRadarCard({
  overdue,
  due,
  upcoming,
}: TaskRadarCardProps) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const chartData = [
    { name: "Overdue", value: overdue },
    { name: "Due soon", value: due },
    { name: "Upcoming", value: upcoming },
  ];

  return (
    <Stack
      sx={{
        border: `1px solid ${borderPalette.dark}`,
        borderRadius: "4px",
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        width: "100%",
        padding: "16px",
        height: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
          background: `linear-gradient(135deg, ${background.accent} 0%, ${background.gradientStop} 100%)`,
          borderColor: borderPalette.light,
        },
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => navigate("/tasks")}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb="8px"
      >
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: text.primary,
          }}
        >
          Task radar
        </Typography>
        <ChevronRight
          size={16}
          style={{
            opacity: isHovered ? 1 : 0.3,
            transition: "opacity 0.2s ease",
            color: text.icon,
          }}
        />
      </Stack>

      <ChartOutlineWrapper>
        <ResponsiveContainer width="100%" height={130} minWidth={0}>
          <BarChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={borderPalette.light} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: text.icon }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: text.tertiary }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={vwTooltipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={BAR_COLORS[entry.name]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartOutlineWrapper>
    </Stack>
  );
}
