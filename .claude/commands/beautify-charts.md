Review and beautify all Recharts charts in the specified file (or all files using Recharts if no argument given).

## Strategy: Replace raw Recharts with VWCharts components

The project has reusable chart components at `Clients/src/presentation/components/Charts/VWCharts.tsx`. These replace raw Recharts boilerplate with consistent styling.

### Available components

| Component | Replaces | Key props |
|-----------|----------|-----------|
| `VWBarChart` | `<BarChart>` + axes + grid + tooltip | `data, series, categoryKey, layout` |
| `VWAreaChart` | `<AreaChart>` + gradient defs + axes | `data, series, categoryKey` |
| `VWDonutChart` | `<PieChart>` + `<Pie>` + center label | `data, dataKey, colors, centerValue` |
| `VWLineChart` | `<LineChart>` + axes + grid | `data, series, categoryKey` |
| `vwTooltipStyle` | Inline tooltip `contentStyle` objects | Use as `contentStyle={vwTooltipStyle}` |
| `VWGradient` | Raw `<linearGradient>` in `<defs>` | `id, color, opacity` |

### Additional utilities at `Charts/chartEnhancements.tsx` (on feat/ai-gateway)

| Utility | Use when |
|---------|----------|
| `ChartCard` | Chart needs its own card container |
| `AnimatedNumber` | Stat value should count up on load |
| `GradientProgressBar` | Progress/percentage bar needed |
| `Sparkline` | Stat card has trend data array |
| `PROVIDER_COLORS` / `getProviderColor()` | Chart shows LLM provider data |

## What to do

For each file with Recharts usage:

1. **Replace raw chart code with VWCharts components**
   - `<ResponsiveContainer><BarChart>...</BarChart></ResponsiveContainer>` → `<VWBarChart data={...} series={[...]} categoryKey="..." />`
   - `<ResponsiveContainer><AreaChart>...</AreaChart></ResponsiveContainer>` → `<VWAreaChart data={...} series={[...]} categoryKey="..." />`
   - `<ResponsiveContainer><PieChart>...</PieChart></ResponsiveContainer>` → `<VWDonutChart data={...} dataKey="..." colors={[...]} />`
   - `<ResponsiveContainer><LineChart>...</LineChart></ResponsiveContainer>` → `<VWLineChart data={...} series={[...]} categoryKey="..." />`

2. **Replace inline tooltip styles** with `vwTooltipStyle`

3. **Remove redundant imports** — after migration, remove individual Recharts imports (XAxis, YAxis, CartesianGrid, etc.) that are now handled internally

4. **Apply enhancements where appropriate**
   - Add `gradientOpacity` to area charts for subtle fills
   - Add `centerValue` / `centerLabel` to donut charts
   - Use `AnimatedNumber` for stat card values
   - Use `getProviderColor()` for provider-specific colors

## Rules

- Import from relative path to `components/Charts/VWCharts` (adjust `../` depth)
- Do NOT change chart data, queries, or business logic — only presentation
- Do NOT force-fit components where custom behavior is needed (e.g., PerformanceChart with dynamic legend + custom tooltip — may only benefit from `vwTooltipStyle`)
- Keep existing chart dimensions and layout
- Use `palette` tokens from `themes/palette` for any new colors — never hardcode hex
- Preserve all existing interactivity (click handlers, tooltips, legends)
- Run TypeScript check after changes: `cd Clients && npx tsc --noEmit`

## Target file

$ARGUMENTS

If no file specified, search for all files importing from "recharts" under `Clients/src/` and beautify each one.
