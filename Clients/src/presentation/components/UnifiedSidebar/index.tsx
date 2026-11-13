/**
 * Unified sidebar (phase 2): one sidebar for every module, built from
 * NAV_GROUPS. Items, gates and counts are data in navConfig.ts; this file
 * evaluates them with the sources today's navigation uses and renders them
 * with SidebarShell's rows, logo, collapse toggle and footer.
 */
import { FC, ReactNode, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import SidebarShell, {
  SidebarItemRow,
  SidebarProjectSelector,
  SidebarRecentSection,
  type RecentSection,
} from "../Sidebar/SidebarShell";
import VWIcon from "../VWIcon";
import { navGroupColor, text as textPalette } from "../../themes/palette";
import { NAV_GROUPS, resolveActive } from "./navConfig";
import type { NavCountKey, NavExtra, NavGate, NavItem, NavSubItem } from "./types";
import type { RootState } from "../../../application/redux/store";
import { useAuth } from "../../../application/hooks/useAuth";
import { useCanCheck } from "../../../application/hooks/useCan";
import { useArenaSetting } from "../../../application/hooks/useArenaSetting";
import { useOpenTasksCount } from "../../../application/hooks/useOpenTasksCount";
import * as featureFlags from "../../../application/config/featureFlags";
import { useEvalsSidebarContextSafe } from "../../../application/contexts/EvalsSidebar.context";
import { useAIDetectionSidebarContextSafe } from "../../../application/contexts/AIDetectionSidebar.context";
import { useShadowAISidebarContextSafe } from "../../../application/contexts/ShadowAISidebar.context";
import { useAIGatewaySidebarContextSafe } from "../../../application/contexts/AIGatewaySidebar.context";
import { useAITrustIndexSidebarContextSafe } from "../../../application/contexts/AITrustIndexSidebar.context";

const EVALS_ITEM_ID = "llm-evals";
/** Sub-items have no icon; this lines their labels up with the item label. */
const SUB_ITEM_INDENT = "32px";

export interface UnifiedSidebarProps {
  onOpenCreateDemoData?: () => void;
  onOpenDeleteDemoData?: () => void;
  onDismissDemoDataButton?: () => void;
  showDemoDataButton?: boolean;
  hasDemoData?: boolean;
  /** Only show demo data options to admins */
  isAdmin?: boolean;
}

interface GateResult {
  visible: boolean;
  disabled: boolean;
  tooltip?: string;
}

/** True when `id` names an item with sub-items. */
const isExpandable = (id: string | undefined): id is string =>
  NAV_GROUPS.some((g) => g.items.some((i) => i.id === id && i.children));

const SHOWN: GateResult = { visible: true, disabled: false };
const HIDDEN: GateResult = { visible: false, disabled: false };

const UnifiedSidebar: FC<UnifiedSidebarProps> = ({
  onOpenCreateDemoData,
  onOpenDeleteDemoData,
  onDismissDemoDataButton,
  showDemoDataButton = true,
  hasDemoData = false,
  isAdmin = false,
}) => {
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const collapsed = useSelector((state: RootState) => state.ui?.sidebar?.collapsed) ?? false;

  // Gate sources: the same ones today's navigation reads.
  const can = useCanCheck();
  const { userRoleName, isSuperAdmin } = useAuth();

  // Count sources: the main sidebar's open-task fetch and the module contexts.
  const openTasks = useOpenTasksCount();
  const evals = useEvalsSidebarContextSafe();
  const detection = useAIDetectionSidebarContextSafe();
  const shadowAi = useShadowAISidebarContextSafe();
  const gateway = useAIGatewaySidebarContextSafe();
  const trustIndex = useAITrustIndexSidebarContextSafe();

  const counts: Record<NavCountKey, number> = {
    openTasks,
    aiTrustIndexTracked: trustIndex?.trackedCount ?? 0,
    shadowAiTools: shadowAi?.toolsCount ?? 0,
    shadowAiAlerts: shadowAi?.alertsCount ?? 0,
    aiDetectionRepositories: detection?.repositoryCount ?? 0,
    aiDetectionHistory: detection?.historyCount ?? 0,
    evalsExperiments: evals?.experimentsCount ?? 0,
    evalsDatasets: evals?.datasetsCount ?? 0,
    evalsScorers: evals?.scorersCount ?? 0,
    evalsModels: evals?.modelsCount ?? 0,
    evalsArena: evals?.arenaCount ?? 0,
    aiGatewayEndpoints: gateway?.endpointsCount ?? 0,
    aiGatewayPrompts: gateway?.promptsCount ?? 0,
  };
  // Today's Evals sidebar is disabled until the context says otherwise.
  const evalsNeedsProject = evals?.disabled ?? true;

  const evaluateGate = (gate?: NavGate): GateResult => {
    if (!gate) return SHOWN;
    if ("permission" in gate) {
      if (can(gate.permission)) return SHOWN;
      return gate.whenDenied === "disable"
        ? { visible: true, disabled: true, tooltip: gate.deniedTooltip }
        : HIDDEN;
    }
    if ("role" in gate) return userRoleName === gate.role ? SHOWN : HIDDEN;
    if ("superAdmin" in gate) return isSuperAdmin ? SHOWN : HIDDEN;
    if ("evalsArena" in gate) return arenaEnabled ? SHOWN : HIDDEN;
    return featureFlags[gate.flag] ? SHOWN : HIDDEN;
  };

  const subState = (sub: NavSubItem): GateResult => {
    const gate = evaluateGate(sub.gate);
    if (!gate.visible) return gate;
    if (sub.requiresEvalsProject && evalsNeedsProject) return { ...gate, disabled: true };
    return gate;
  };

  const active = useMemo(() => resolveActive(pathname, hash), [pathname, hash]);
  const activeItemId = active?.itemId;

  // One item open at a time; the current route's item opens on its own.
  const [openItemId, setOpenItemId] = useState<string | null>(() =>
    isExpandable(activeItemId) ? activeItemId : null,
  );
  // On a route change, open the new route's item (state adjusted during render).
  const [openedForItemId, setOpenedForItemId] = useState(activeItemId);
  if (openedForItemId !== activeItemId) {
    setOpenedForItemId(activeItemId);
    if (isExpandable(activeItemId)) setOpenItemId(activeItemId);
  }

  // The Arena setting lives on the EvalServer: ask only where Arena can show.
  const onEvalsRoute = pathname === "/evals" || pathname.startsWith("/evals/");
  const { data: arenaSetting } = useArenaSetting({
    enabled: onEvalsRoute || openItemId === EVALS_ITEM_ID,
  });
  const arenaEnabled = arenaSetting?.enabled === true;

  /**
   * LLM Evals keeps ContextSidebar's rule: away from /evals, go to the current
   * project's tab (or /evals#<tab>); on an /evals page without a project in
   * the URL, move to the current project; otherwise keep the path.
   */
  const evalsPath = (tab: string): string => {
    const projectId = evals?.currentProject?.id;
    if (!onEvalsRoute) return projectId ? `/evals/${projectId}#${tab}` : `/evals#${tab}`;
    const hasProjectInUrl = Boolean(pathname.split("/")[2]);
    if (!hasProjectInUrl && projectId) return `/evals/${projectId}#${tab}`;
    return `${pathname}#${tab}`;
  };

  const goToSub = (item: NavItem, sub: NavSubItem) =>
    navigate(item.id === EVALS_ITEM_ID ? evalsPath(sub.id) : sub.path);

  const handleItemClick = (item: NavItem) => {
    if (!item.children) {
      if (item.path) navigate(item.path);
      return;
    }
    if (collapsed) {
      const first = item.children.find((s) => {
        const state = subState(s);
        return state.visible && !state.disabled;
      });
      if (first) goToSub(item, first);
      return;
    }
    setOpenItemId((current) => (current === item.id ? null : item.id));
  };

  const recentSectionFor = (extra: NavExtra): RecentSection | null => {
    switch (extra) {
      case "evalsRecentExperiments":
        return {
          title: "Recent experiments",
          items: (evals?.recentExperiments ?? []).map((exp) => ({
            id: exp.id,
            name: exp.name,
            onClick: () => evals?.onExperimentClick?.(exp.id, exp.projectId),
          })),
        };
      case "evalsRecentProjects":
        return {
          title: "Recent projects",
          items: (evals?.recentProjects ?? []).map((proj) => ({
            id: proj.id,
            name: proj.name,
            onClick: () => evals?.onProjectClick?.(proj.id),
          })),
        };
      case "recentScans":
        return {
          title: "Recent scans",
          items: (detection?.recentScans ?? []).map((scan) => ({
            id: String(scan.id),
            name: scan.name,
            onClick: () => navigate(`/ai-detection/scans/${scan.id}`),
          })),
        };
      case "recentTools":
        return {
          title: "Recent tools",
          items: (shadowAi?.recentTools ?? []).map((tool) => ({
            id: String(tool.id),
            name: tool.name,
            onClick: () => navigate(`/shadow-ai/tools/${tool.id}`),
          })),
        };
      default:
        return null;
    }
  };

  const renderSubItems = (item: NavItem): ReactNode => {
    let lastSection: string | undefined;
    return (item.children ?? []).map((sub) => {
      const state = subState(sub);
      if (!state.visible) return null;
      const heading =
        sub.section && sub.section !== lastSection ? (
          <Typography
            key={`section-${sub.section}`}
            sx={{
              fontSize: "11px",
              fontWeight: 500,
              color: textPalette.tertiary,
              pl: SUB_ITEM_INDENT,
              pt: "8px",
              pb: "2px",
            }}
          >
            {sub.section}
          </Typography>
        ) : null;
      lastSection = sub.section;
      return (
        <Box key={sub.id}>
          {heading}
          <SidebarItemRow
            item={{
              id: sub.id,
              label: sub.label,
              icon: null,
              count: sub.countKey ? counts[sub.countKey] : undefined,
              disabled: state.disabled,
            }}
            isActive={active?.itemId === item.id && active.subId === sub.id}
            collapsed={false}
            onClick={() => goToSub(item, sub)}
            paddingLeft={SUB_ITEM_INDENT}
            tooltip={state.disabled ? state.tooltip : undefined}
            testId={`nav-sub-${item.id}-${sub.id}`}
          />
        </Box>
      );
    });
  };

  const renderOpenSection = (item: NavItem): ReactNode => {
    const extras = item.extras ?? [];
    const showSelector = extras.includes("evalsProjectSelector") && evals?.onProjectChange;
    return (
      <Box
        id={`nav-section-${item.id}`}
        data-testid={`nav-section-${item.id}`}
        role="group"
        aria-label={item.label}
        sx={{ pb: "4px" }}
      >
        {showSelector && (
          <Box sx={{ pl: SUB_ITEM_INDENT, pt: "4px" }}>
            <SidebarProjectSelector
              currentProject={evals.currentProject ?? null}
              allProjects={evals.allProjects ?? []}
              onProjectChange={evals.onProjectChange!}
            />
          </Box>
        )}
        {renderSubItems(item)}
        {extras.map((extra) => {
          const section = recentSectionFor(extra);
          return section ? (
            <Box key={extra} sx={{ pl: "24px" }}>
              <SidebarRecentSection section={section} />
            </Box>
          ) : null;
        })}
      </Box>
    );
  };

  const navContent = NAV_GROUPS.map((group) => {
    const colors = navGroupColor[group.id];
    const items = group.items.filter((item) => evaluateGate(item.gate).visible);
    if (items.length === 0) return null;
    return (
      <Box key={group.id} sx={{ mt: group.heading ? "8px" : 0 }}>
        {group.heading && !collapsed && (
          <Typography
            data-testid={`nav-group-heading-${group.id}`}
            sx={{
              fontSize: "11px",
              fontWeight: 500,
              color: colors.heading,
              px: "8px",
              pt: "8px",
              pb: "4px",
            }}
          >
            {group.heading}
          </Typography>
        )}
        {items.map((item) => {
          const expandable = Boolean(item.children);
          const isOpen = expandable && !collapsed && openItemId === item.id;
          // A parent shows as selected only while its sub-items are out of view.
          const isActive = activeItemId === item.id && (!expandable || collapsed || !isOpen);
          return (
            <Box key={item.id}>
              <SidebarItemRow
                item={{
                  id: item.id,
                  label: item.label,
                  icon: <VWIcon name={item.icon} size={16} />,
                  count: item.countKey ? counts[item.countKey] : undefined,
                }}
                isActive={isActive}
                collapsed={collapsed}
                onClick={() => handleItemClick(item)}
                iconColor={colors.icon}
                ariaExpanded={expandable && !collapsed ? isOpen : undefined}
                ariaControls={isOpen ? `nav-section-${item.id}` : undefined}
                endAdornment={
                  expandable ? (
                    <Box
                      component="span"
                      // The row shakes its icon on hover; the chevron stays still.
                      sx={{
                        "ml": "auto",
                        "display": "flex",
                        "color": textPalette.tertiary,
                        "& svg": { animation: "none !important" },
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown size={14} strokeWidth={1.5} />
                      ) : (
                        <ChevronRight size={14} strokeWidth={1.5} />
                      )}
                    </Box>
                  ) : undefined
                }
                testId={`nav-item-${item.id}`}
              />
              {isOpen && renderOpenSection(item)}
            </Box>
          );
        })}
      </Box>
    );
  });

  return (
    <SidebarShell
      navContent={navContent}
      hasDemoData={hasDemoData}
      onOpenCreateDemoData={onOpenCreateDemoData}
      onOpenDeleteDemoData={onOpenDeleteDemoData}
      onDismissDemoDataButton={onDismissDemoDataButton}
      showDemoDataButton={showDemoDataButton}
      showReadyToSubscribe={true}
      isAdmin={isAdmin}
      enableFlyingHearts={true}
    />
  );
};

export default UnifiedSidebar;
