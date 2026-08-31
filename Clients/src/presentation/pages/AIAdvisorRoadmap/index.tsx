import { useMemo, useState } from "react";
import { Box, LinearProgress, Stack, Typography } from "@mui/material";
import { CheckCircle2, Gauge, ListChecks, RefreshCw } from "lucide-react";

import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { StatCard } from "../../components/Cards/StatCard";
import { SearchBox } from "../../components/Search";
import Select from "../../components/Inputs/Select";
import Chip from "../../components/Chip";
import CustomizableSkeleton from "../../components/Skeletons";
import { EmptyState } from "../../components/EmptyState";
import { useAdvisorToolsRoadmap } from "../../../application/hooks/useAdvisorToolsRoadmap";
import RoadmapToolCard from "./RoadmapToolCard";
import {
  extraToolsStyle,
  filterRowStyle,
  mainStackStyle,
  progressRowStyle,
  sectionStyle,
  sectionTitleStyle,
  summaryCardsStyle,
  toolbarStyle,
  toolGridStyle,
} from "./style";
import { palette } from "../../themes/palette";

type StatusFilter = "all" | "implemented" | "planned" | "renamed";
type KindFilter = "all" | "read" | "write";

const STATUS_FILTER_OPTIONS = [
  { _id: "all", name: "All statuses" },
  { _id: "implemented", name: "Implemented" },
  { _id: "planned", name: "Planned" },
  { _id: "renamed", name: "Renamed" },
];

const KIND_FILTER_OPTIONS = [
  { _id: "all", name: "All kinds" },
  { _id: "read", name: "Read" },
  { _id: "write", name: "Write" },
];

/**
 * Read-only tracker of planned vs. implemented AI Advisor tools, derived
 * from the AI Implementation Plan catalogue and the live tool registry.
 */
export default function AIAdvisorRoadmap() {
  const [searchTerm, setSearchTerm] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const { data, isLoading, error } = useAdvisorToolsRoadmap();

  const domainFilterOptions = useMemo(
    () => [
      { _id: "all", name: "All domains" },
      ...(data?.domains ?? []).map((d) => ({ _id: d.key, name: d.label })),
    ],
    [data],
  );

  const phaseFilterOptions = useMemo(
    () => [
      { _id: "all", name: "All phases" },
      ...(data?.phases ?? [])
        .filter((p) => p.total > 0)
        .map((p) => ({ _id: String(p.id), name: p.title })),
    ],
    [data],
  );

  const filteredTools = useMemo(() => {
    const tools = data?.tools ?? [];
    const term = searchTerm.trim().toLowerCase();
    return tools.filter((tool) => {
      if (
        domainFilter !== "all" &&
        tool.domain !== data?.domains.find((d) => d.key === domainFilter)?.label
      ) {
        return false;
      }
      if (phaseFilter !== "all" && tool.phase !== Number(phaseFilter)) return false;
      if (statusFilter !== "all" && tool.status !== statusFilter) return false;
      if (kindFilter !== "all" && tool.kind !== kindFilter) return false;
      if (
        term &&
        !tool.name.toLowerCase().includes(term) &&
        !tool.label.toLowerCase().includes(term) &&
        !tool.description.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [data, searchTerm, domainFilter, phaseFilter, statusFilter, kindFilter]);

  return (
    <PageHeaderExtended
      title="AI Advisor roadmap"
      description="Planned vs. implemented AI Advisor tools from the AI Implementation Plan."
      summaryCards={
        data ? (
          <Box sx={summaryCardsStyle}>
            <StatCard
              title="Planned tools"
              value={data.summary.planned}
              Icon={ListChecks}
              subtitle={`Catalogue rows: ${data.sources.manifestEntries} (plan claims ${data.sources.plannedTotal})`}
            />
            <StatCard title="Implemented" value={data.summary.implemented} Icon={CheckCircle2} />
            <StatCard
              title="Renamed"
              value={data.summary.renamed}
              Icon={RefreshCw}
              subtitle="Implemented under a different name"
            />
            <StatCard
              title="Overall progress"
              value={`${data.summary.percentComplete}%`}
              Icon={Gauge}
              subtitle={`${data.summary.missing} planned tools not yet implemented`}
            />
          </Box>
        ) : undefined
      }
    >
      <Stack sx={mainStackStyle}>
        {isLoading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        ) : error || !data ? (
          <EmptyState
            message="Failed to load the advisor tools roadmap. Please try again."
            showBorder
          />
        ) : (
          <>
            <Box sx={toolbarStyle}>
              <Box sx={filterRowStyle}>
                <SearchBox
                  placeholder="Search tools"
                  value={searchTerm}
                  onChange={(value) => setSearchTerm(value)}
                  sx={{ width: 260 }}
                />
                <Select
                  id="roadmap-domain-filter"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(String(e.target.value))}
                  items={domainFilterOptions}
                  sx={{ width: 220 }}
                />
                <Select
                  id="roadmap-phase-filter"
                  value={phaseFilter}
                  onChange={(e) => setPhaseFilter(String(e.target.value))}
                  items={phaseFilterOptions}
                  sx={{ width: 200 }}
                />
                <Select
                  id="roadmap-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  items={STATUS_FILTER_OPTIONS}
                  sx={{ width: 160 }}
                />
                <Select
                  id="roadmap-kind-filter"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                  items={KIND_FILTER_OPTIONS}
                  sx={{ width: 140 }}
                />
              </Box>
            </Box>

            {filteredTools.length === 0 ? (
              <EmptyState message="No tools match your search or filter criteria." showBorder />
            ) : (
              <Box sx={toolGridStyle}>
                {filteredTools.map((tool) => (
                  <RoadmapToolCard key={tool.id} tool={tool} />
                ))}
              </Box>
            )}

            {data.extraTools.length > 0 && (
              <Stack sx={sectionStyle}>
                <Typography sx={sectionTitleStyle}>
                  Implemented but not in the plan ({data.extraTools.length})
                </Typography>
                <Box sx={extraToolsStyle}>
                  {data.extraTools.map((tool) => (
                    <Chip
                      key={tool.name}
                      label={tool.name}
                      variant="default"
                      size="small"
                      uppercase={false}
                    />
                  ))}
                </Box>
              </Stack>
            )}

            <Stack sx={sectionStyle}>
              <Typography sx={sectionTitleStyle}>Progress by domain</Typography>
              {data.domains.map((domain) => (
                <Box key={domain.key} sx={progressRowStyle}>
                  <Typography sx={{ fontSize: 13 }}>{domain.label}</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={domain.percentComplete}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                    {domain.implemented}/{domain.total} ({domain.percentComplete}%)
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Stack sx={sectionStyle}>
              <Typography sx={sectionTitleStyle}>Progress by phase</Typography>
              {data.phases.map((phase) => (
                <Box key={phase.id} sx={progressRowStyle}>
                  <Typography sx={{ fontSize: 13 }}>
                    {phase.id > 0 ? `Phase ${phase.id} — ` : ""}
                    {phase.title}
                  </Typography>
                  {phase.total > 0 ? (
                    <LinearProgress
                      variant="determinate"
                      value={phase.percentComplete ?? 0}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                      Capability phase — no catalogued tools (priority: {phase.priority}, depends
                      on: {phase.dependencies})
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                    {phase.total > 0
                      ? `${phase.implemented}/${phase.total} (${phase.percentComplete}%)`
                      : "—"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </PageHeaderExtended>
  );
}
