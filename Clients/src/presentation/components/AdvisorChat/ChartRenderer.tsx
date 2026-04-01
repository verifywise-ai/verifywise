import { FC, memo } from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { VWDonutChart, vwTooltipStyle, axisTick, axisLine, gridStroke } from '../Charts/VWCharts';
import palette, { chart as chartPalette } from '../../themes/palette';

interface ChartData {
  type: 'bar' | 'pie' | 'table' | 'donut' | 'line';
  data: {label: string, value: number, color?: string}[] ;
  title: string;
  series?: Array<{
    label: string;
    data: number[];
  }>;
  xAxisLabels?: string[];
}

interface ChartRendererProps {
  chartData: ChartData;
}

const ChartRendererComponent: FC<ChartRendererProps> = ({ chartData }) => {
  const theme = useTheme();
  const size = 200;

  // Return null if no chart data at all
  if (!chartData) {
    return null;
  }

  const { type, data, title, series, xAxisLabels } = chartData;

  // For line charts with series, we don't need data array
  // For all other charts, we need data array
  const hasValidData = data && Array.isArray(data) && data.length > 0;
  const hasValidSeries = series && Array.isArray(series) && series.length > 0 && xAxisLabels;

  if (type === 'line') {
    // Line chart can use either series or data
    if (!hasValidSeries && !hasValidData) {
      return null;
    }
  } else {
    // All other chart types require data
    if (!hasValidData) {
      return null;
    }
  }

  const renderChart = () => {
    switch (type) {
      case 'line': {
        // Line chart for timeseries data with series
        if (hasValidSeries) {
          // Transform series + xAxisLabels into Recharts-compatible data array
          const lineData = xAxisLabels!.map((label, i) => {
            const point: Record<string, string | number> = { label };
            series!.forEach(s => {
              point[s.label] = s.data[i] ?? 0;
            });
            return point;
          });

          return (
            <ResponsiveContainer width={300} height={250} minWidth={0}>
              <LineChart data={lineData} margin={{ left: 0, right: 20, top: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
                <YAxis tick={axisTick} tickLine={false} axisLine={axisLine} />
                <Tooltip contentStyle={vwTooltipStyle} />
                {series!.map((s, i) => (
                  <Line
                    key={s.label}
                    type="linear"
                    dataKey={s.label}
                    stroke={chartPalette[i % chartPalette.length]}
                    strokeWidth={1.5}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          );
        }

        // Fallback for simple line chart using data array
        if (!hasValidData) return null;
        const simpleLineData = data.map(item => ({ label: item.label, value: item.value }));
        return (
          <ResponsiveContainer width={320} height={250} minWidth={0}>
            <LineChart data={simpleLineData} margin={{ left: 0, right: 20, top: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
              <YAxis tick={axisTick} tickLine={false} axisLine={axisLine} />
              <Tooltip contentStyle={vwTooltipStyle} />
              <Line
                type="linear"
                dataKey="value"
                stroke={palette.brand.primary}
                strokeWidth={1.5}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      }

      case 'bar': {
        const barChartData = data.map(item => ({ label: item.label, value: item.value }));
        return (
          <ResponsiveContainer width={300} height={size} minWidth={0}>
            <BarChart data={barChartData} margin={{ left: 0, right: 20, top: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
              <YAxis tick={axisTick} tickLine={false} axisLine={axisLine} />
              <Tooltip contentStyle={vwTooltipStyle} />
              <Bar
                dataKey="value"
                fill={palette.brand.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        );
      }

      case 'pie':
      case 'donut': {
        const isPie = type === 'pie';
        const chartData = data.map(item => ({ name: item.label, value: item.value }));
        const colors = data.map(
          (item, i) => item.color || chartPalette[i % chartPalette.length]
        );
        return (
          <VWDonutChart
            data={chartData}
            dataKey="value"
            nameKey="name"
            colors={colors}
            size={size}
            innerRadius={isPie ? 0 : Math.floor(size * 0.35)}
            outerRadius={isPie ? Math.floor(size / 2) - 5 : Math.floor(size * 0.45)}
          />
        );
      }

      case 'table':
        return (
          <Box sx={{ width: '100%', minWidth: 200 }}>
            {data.map((item, index) => (
              <Box
                key={`row-${index}`}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 3,
                  padding: '5px 0',
                  borderBottom: index < data.length - 1 ? 1 : 'none',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  sx={{
                    fontSize: theme.typography.caption.fontSize,
                    color: 'text.secondary',
                  }}
                >
                  {item.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: theme.typography.caption.fontSize,
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            Unsupported chart type: {type}
          </Typography>
        );
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        padding: 2,
        marginTop: 1,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        width: '100%',
      }}
    >
      {title && (
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, marginBottom: type === 'table' ? 1 : 2, fontSize: theme.typography.body2.fontSize }}>
          {title}
        </Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: type === 'table' ? 'auto' : 200,
        }}
      >
        {renderChart()}
      </Box>
    </Paper>
  );
};

export const ChartRenderer = memo(ChartRendererComponent);
