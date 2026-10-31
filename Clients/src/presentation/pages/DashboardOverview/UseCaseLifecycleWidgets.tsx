import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { EmptyStateMessage } from "../../components/EmptyStateMessage";
import { ButtonToggle } from "../../components/button-toggle";
import StatusBadge from "../../components/StatusBadge";
import useNavigateSearch from "../../../application/hooks/useNavigateSearch";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  useUseCaseLifecycleDashboard,
  useUseCaseStageCounts,
} from "../../../application/hooks/useUseCaseLifecycle";
import { useDashboard } from "../../../application/hooks/useDashboard";
import type {
  LifecycleBreakdownRow,
  LifecycleDashboardItem,
} from "../../../application/repository/useCaseLifecycle.repository";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABELS,
} from "../../../domain/enums/lifecycleStage.enum";

/**
 * Use case lifecycle widgets (#5187): counts per stage, going live / retired
 * this quarter, live use cases by department, risk tier or regulation, and
 * stale entries, plus time in review for approved use case intake requests
 * (#5188). Time in review is shown on its own; comparing it with an agreed
 * review time needs the per-form setting from #5189.
 */

type Breakdown = "department" | "risk_tier" | "regulation";

const BREAKDOWN_EMPTY_LABEL: Record<Breakdown, string> = {
  department: "No department",
  risk_tier: "Not classified",
  regulation: "",
};

/** Risk tiers are stored lower case ("high risk"); UI text is sentence case. */
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const rowTextSx = { fontSize: 13, color: "text.primary" };
const mutedSx = { fontSize: 12, color: "text.secondary" };

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <Box sx={{ flex: 1, height: "6px", borderRadius: "4px", bgcolor: "action.hover" }}>
      <Box
        sx={{ width: `${width}%`, height: "100%", borderRadius: "4px", bgcolor: "primary.main" }}
      />
    </Box>
  );
}

function CountRows({
  rows,
  onRowClick,
}: {
  rows: { key: string; label: string; count: number }[];
  onRowClick?: (key: string) => void;
}) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return (
    <Stack sx={{ gap: "12px" }} role="list">
      {rows.map((row) => (
        <Stack
          key={row.key}
          role="listitem"
          direction="row"
          alignItems="center"
          sx={{ gap: "12px", cursor: onRowClick ? "pointer" : "default" }}
          onClick={(event) => {
            if (!onRowClick) return;
            event.stopPropagation();
            onRowClick(row.key);
          }}
        >
          <Typography sx={{ ...rowTextSx, width: "140px", flexShrink: 0 }} noWrap title={row.label}>
            {row.label}
          </Typography>
          <Bar value={row.count} max={max} />
          <Typography sx={{ ...rowTextSx, width: "32px", textAlign: "right", fontWeight: 600 }}>
            {row.count}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ReviewTimeRow({ label, days }: { label: string; days: number | null }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography sx={mutedSx}>{label}</Typography>
      <Stack direction="row" alignItems="baseline" sx={{ gap: "4px" }}>
        <Typography sx={{ fontSize: 20, fontWeight: 600, color: "text.primary" }}>
          {days ?? "-"}
        </Typography>
        <Typography sx={mutedSx}>days</Typography>
      </Stack>
    </Stack>
  );
}

function ItemList({
  items,
  onOpen,
}: {
  items: LifecycleDashboardItem[];
  onOpen: (id: number) => void;
}) {
  const formatDate = useFormattedDate();
  return (
    <Stack sx={{ gap: "8px" }} role="list">
      {items.map((item) => (
        <Stack
          key={item.id}
          role="listitem"
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ gap: "8px", cursor: "pointer" }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item.id);
          }}
        >
          <Typography sx={rowTextSx} noWrap>
            {item.title}
          </Typography>
          <Typography sx={{ ...mutedSx, flexShrink: 0 }}>
            {item.date ? formatDate(item.date) : "-"}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

const UseCaseLifecycleWidgets = () => {
  const navigateSearch = useNavigateSearch();
  const { data, isError } = useUseCaseLifecycleDashboard();
  // The same counts as the Use cases tabs: the use cases list by stage, with
  // pending intake requests in In review (useUseCaseStageCounts).
  const { dashboard: overview } = useDashboard();
  const projects = useMemo(() => overview?.projects_list ?? [], [overview]);
  const { counts } = useUseCaseStageCounts(projects);
  const [breakdown, setBreakdown] = useState<Breakdown>("department");

  if (isError || !data) return null;

  const openUseCase = (id: number) => navigateSearch("/project-view", { projectId: String(id) });
  const openStage = (stage: string) => navigateSearch("/overview", { stage });

  const stageRows = LIFECYCLE_STAGES.map((stage) => ({
    key: stage,
    label: LIFECYCLE_STAGE_LABELS[stage],
    count: counts[stage],
  }));
  const breakdownRows = (data.live_by[breakdown] as LifecycleBreakdownRow[]).map((row) => ({
    key: row.label || "__none__",
    label: row.label ? sentenceCase(row.label) : BREAKDOWN_EMPTY_LABEL[breakdown],
    count: row.count,
  }));
  const quarterEmpty = data.quarter.going_live.length === 0 && data.quarter.retired.length === 0;

  return (
    <Box
      data-testid="use-case-lifecycle-widgets"
      sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", mb: "16px" }}
    >
      <DashboardCard title="Use case lifecycle" navigateTo="/overview">
        <CountRows rows={stageRows} onRowClick={openStage} />
      </DashboardCard>

      <DashboardCard title="This quarter">
        {quarterEmpty ? (
          <EmptyStateMessage message="Nothing went live or was retired this quarter" />
        ) : (
          <Stack sx={{ gap: "16px" }}>
            {data.quarter.going_live.length > 0 && (
              <Stack sx={{ gap: "8px" }}>
                <Typography sx={mutedSx}>Going live</Typography>
                <ItemList items={data.quarter.going_live} onOpen={openUseCase} />
              </Stack>
            )}
            {data.quarter.retired.length > 0 && (
              <Stack sx={{ gap: "8px" }}>
                <Typography sx={mutedSx}>Retired</Typography>
                <ItemList items={data.quarter.retired} onOpen={openUseCase} />
              </Stack>
            )}
          </Stack>
        )}
      </DashboardCard>

      <DashboardCard title="Time in review">
        {data.review_time.approved === 0 ? (
          <EmptyStateMessage message="No intake requests were approved in the last 12 months" />
        ) : (
          <Stack sx={{ gap: "12px" }} data-testid="use-case-review-time">
            <ReviewTimeRow label="Median" days={data.review_time.median_days} />
            <ReviewTimeRow label="Average" days={data.review_time.average_days} />
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={mutedSx}>Approved in the last 12 months</Typography>
              <Typography sx={{ ...rowTextSx, fontWeight: 600 }}>
                {data.review_time.approved}
              </Typography>
            </Stack>
            <Typography sx={mutedSx}>
              From submission to approval of use case intake requests.
            </Typography>
          </Stack>
        )}
      </DashboardCard>

      <Box sx={{ gridColumn: "span 2" }}>
        <DashboardCard
          title="Live use cases by"
          action={
            <ButtonToggle
              options={[
                { label: "Department", value: "department" },
                { label: "Risk tier", value: "risk_tier" },
                { label: "Regulation", value: "regulation" },
              ]}
              value={breakdown}
              onChange={(value) => setBreakdown(value as Breakdown)}
              height={30}
            />
          }
        >
          {breakdownRows.length === 0 ? (
            <EmptyStateMessage
              message={
                breakdown === "regulation"
                  ? "No live use cases have a framework yet"
                  : "No live use cases yet"
              }
            />
          ) : (
            <CountRows rows={breakdownRows} />
          )}
        </DashboardCard>
      </Box>

      <DashboardCard
        title="Stale use cases"
        action={
          data.stale.total > 0 ? (
            <StatusBadge
              label={String(data.stale.total)}
              variant="warning"
              size="small"
              uppercase={false}
            />
          ) : undefined
        }
      >
        {data.stale.total === 0 ? (
          <EmptyStateMessage message="Every live use case was confirmed recently" />
        ) : (
          <Stack sx={{ gap: "8px" }}>
            <Typography sx={mutedSx}>Last confirmed or went live</Typography>
            <ItemList items={data.stale.items} onOpen={openUseCase} />
          </Stack>
        )}
      </DashboardCard>
    </Box>
  );
};

export default UseCaseLifecycleWidgets;
