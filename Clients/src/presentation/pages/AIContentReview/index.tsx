import { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Tab,
  Tabs,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import { Sparkles, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { VisibilityChips } from "../../components/VisibilityToggle";
import type { VisibilityFilterValue } from "../../components/VisibilityToggle";
import {
  text as textColors,
  background,
  border as borderPalette,
  brand,
} from "../../themes/palette";
import Chip from "../../components/Chip";
import AIContentReviewPanel from "../../components/AIContentReviewPanel";
import {
  useUnreviewedContent,
  useAIContentStats,
  useReviewContent,
} from "../../../application/hooks/useAIContent";
import type { ReviewAction } from "../../../domain/interfaces/i.aiContent";

const cardSx = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
};

const BADGE_COLORS: Record<string, { label: string; color: string }> = {
  generated: { label: "AI-generated", color: brand.primary },
  assisted: { label: "AI-assisted", color: brand.primary },
  reviewed: { label: "AI-reviewed", color: brand.primary },
  suggested: { label: "AI-suggested", color: brand.primary },
};

export default function AIContentReview() {
  const [tab, setTab] = useState(0);
  const [visFilter, setVisFilter] = useState<VisibilityFilterValue>("all");
  const { data: statsData, isLoading: statsLoading } = useAIContentStats();
  const { data: unreviewedData, isLoading: unreviewedLoading } = useUnreviewedContent(50);
  const reviewMutation = useReviewContent();

  const handleReview = (id: number, action: ReviewAction, notes?: string) => {
    reviewMutation.mutate({ id, action, notes });
  };

  const items = unreviewedData?.items ?? [];
  const total = unreviewedData?.total ?? 0;

  const stats = statsData;
  const reviewRate = stats?.review_rate ?? 0;

  return (
    <Box>
      {/* Header — matches app design */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb="8px">
        <Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: 20,
              fontFamily: "'Red Hat Display', 'Geist', sans-serif",
              color: textColors.primary,
            }}
          >
            AI content review
          </Typography>
          <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: 0.25 }}>
            Review and approve AI-generated content for EU AI Act article 52 transparency
            compliance.
          </Typography>
        </Box>
        <VisibilityChips value={visFilter} onChange={setVisFilter} />
      </Stack>

      {/* Stat header cards — matching DashboardHeaderCard style */}
      <Box
        sx={{
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "8px",
          "mb": "8px",
          "& > *": { flex: "1 1 0", minWidth: "120px" },
        }}
      >
        {statsLoading ? (
          <Box sx={{ p: 2, textAlign: "center", width: "100%" }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <>
            <Stack sx={{ ...cardSx, borderRadius: 2, padding: "8px 14px 14px 14px" }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <BarChart3 size={13} style={{ color: textColors.icon }} />
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  Total items
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}
              >
                {stats?.total ?? 0}
              </Typography>
            </Stack>

            <Stack sx={{ ...cardSx, borderRadius: 2, padding: "8px 14px 14px 14px" }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CheckCircle size={13} style={{ color: textColors.icon }} />
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  Reviewed
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}
              >
                {reviewRate}%
              </Typography>
            </Stack>

            <Stack sx={{ ...cardSx, borderRadius: 2, padding: "8px 14px 14px 14px" }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Clock size={13} style={{ color: textColors.icon }} />
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  Pending
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}
              >
                {stats?.unreviewed ?? 0}
              </Typography>
            </Stack>

            <Stack sx={{ ...cardSx, borderRadius: 2, padding: "8px 14px 14px 14px" }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Sparkles size={13} style={{ color: textColors.icon }} />
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  Avg confidence
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}
              >
                {stats?.avg_confidence ?? "—"}
                {stats?.avg_confidence != null && (
                  <Box component="span" sx={{ fontSize: 14, fontWeight: 500 }}>
                    %
                  </Box>
                )}
              </Typography>
            </Stack>
          </>
        )}
      </Box>

      {/* Review progress bar + By Type breakdown — in DashboardCard style */}
      {stats && stats.total > 0 && (
        <Box sx={{ display: "flex", gap: "8px", mb: "8px", flexWrap: "wrap" }}>
          {/* Progress card */}
          <Card elevation={0} sx={{ ...cardSx, flex: "2 1 300px" }}>
            <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
              <Stack direction="row" justifyContent="space-between" mb={0.75}>
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  Review progress
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: textColors.primary }}>
                  {stats.reviewed}/{stats.total}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={reviewRate}
                sx={{
                  "height": 6,
                  "borderRadius": 3,
                  "backgroundColor": background.hover,
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 3,
                    backgroundColor: brand.primary,
                  },
                }}
              />
            </CardContent>
          </Card>

          {/* By type card */}
          <Card elevation={0} sx={{ ...cardSx, flex: "1 1 200px" }}>
            <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
              <Typography
                sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500, mb: 1 }}
              >
                By type
              </Typography>
              <Stack spacing={0.5}>
                {Object.entries(stats.by_badge_type).map(([key, count]: [string, any]) => {
                  const config = BADGE_COLORS[key];
                  if (!config || count === 0) return null;
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <Stack key={key} direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "2px",
                          backgroundColor: config.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography sx={{ fontSize: 11, color: textColors.secondary, flex: 1 }}>
                        {config.label}
                      </Typography>
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: textColors.primary }}>
                        {count} ({pct}%)
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Tabs — same tab style as app */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        TabIndicatorProps={{ style: { backgroundColor: brand.primary } }}
        sx={{
          "mb": "8px",
          "minHeight": "20px",
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 400,
            minHeight: "20px",
            padding: "16px 0 7px",
            fontSize: 13,
          },
          "& .Mui-selected": { color: brand.primary },
          "& .MuiTabs-flexContainer": { columnGap: "34px" },
        }}
      >
        <Tab
          label={
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <span>Pending review</span>
              {total > 0 && (
                <Chip label={String(total)} size="small" variant="warning" uppercase={false} />
              )}
            </Stack>
          }
        />
        <Tab label="All AI content" />
      </Tabs>

      {/* Tab content */}
      {tab === 0 && (
        <Box>
          {unreviewedLoading ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <CircularProgress size={20} />
            </Box>
          ) : items.length > 0 ? (
            <Stack spacing="8px">
              {items.map((item: any) => (
                <AIContentReviewPanel
                  key={item.id}
                  item={item}
                  onReview={handleReview}
                  isReviewing={reviewMutation.isPending}
                />
              ))}
            </Stack>
          ) : (
            <Card elevation={0} sx={cardSx}>
              <CardContent sx={{ "textAlign": "center", "py": 4, "&:last-child": { pb: 4 } }}>
                <CheckCircle
                  size={32}
                  strokeWidth={1}
                  style={{ color: textColors.icon, marginBottom: 8 }}
                />
                <Typography
                  sx={{ fontSize: 14, fontWeight: 600, color: textColors.primary, mb: 0.5 }}
                >
                  All caught up!
                </Typography>
                <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
                  No AI-generated content pending review.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "textAlign": "center", "py": 4, "&:last-child": { pb: 4 } }}>
            <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
              Full AI content history will be available in a future release. Use the stats above for
              current overview.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
