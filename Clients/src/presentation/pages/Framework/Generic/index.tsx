/**
 * Generic Framework Page
 *
 * Renders the L1 → L2 (→ L3) tree for any framework served by the generic
 * impl endpoints (Servers/structures/-driven). Structured to match ISO
 * 27001's clause page exactly: TabFilterBar at the top, accordion list of
 * L1 sections, StatusDropdown per row, shared drawer on click.
 *
 * Usable two ways:
 *   1. As a page at route /projects/:projectId/framework/:frameworkId.
 *   2. Embedded inside another component (e.g. ProjectFrameworks) by
 *      passing `projectId` and `frameworkId` as props.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowRight as RightArrowBlack } from "lucide-react";

import { getEntityById } from "../../../../application/repository/entity.repository";
import GenericFrameworkDrawer from "../../../components/Drawer/GenericFrameworkDrawer";
import StatusDropdown from "../../../components/StatusDropdown";
import { updateGenericImplStatus } from "../../../components/StatusDropdown/statusUpdateApi";
import { TabFilterBar } from "../../../components/FrameworkFilter/TabFilterBar";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { useAuth } from "../../../../application/hooks/useAuth";
import allowedRoles from "../../../../application/constants/permissions";
import { StatsCard } from "../../../components/Cards/StatsCard";
import { brand } from "../../../themes/palette";
import { pluralizeEntityType } from "../../../tools/pluralizeEntityType";
import { styles } from "./style";

interface FrameworkMeta {
  id: number;
  key: string;
  framework_type: string;
  display_name: string;
  entity_types: { l2_impl: string; l3_impl?: string | null };
  hierarchy_type: "two_level" | "three_level";
}

interface TreeNode {
  struct_id: number;
  impl_id: number | null;
  title: string;
  description?: string | null;
  summary?: string | null;
  questions?: string[] | null;
  evidence_examples?: string[] | null;
  status?: string | null;
  order_no?: number | null;
  children?: TreeNode[];
}

interface L1Node {
  id: number;
  title: string;
  description?: string | null;
  order_no?: number | null;
  children: TreeNode[];
}

interface TreeResponse {
  projects_frameworks_id: number;
  framework: FrameworkMeta;
  tree: L1Node[];
}

interface SelectedRow {
  level: "l2" | "l3";
  node: TreeNode;
}

interface GenericFrameworkProps {
  projectId?: number;
  frameworkId?: number;
}

const STATUS_OPTIONS = [
  { label: "Not started", value: "Not started" },
  { label: "Draft", value: "Draft" },
  { label: "In progress", value: "In progress" },
  { label: "Awaiting review", value: "Awaiting review" },
  { label: "Awaiting approval", value: "Awaiting approval" },
  { label: "Implemented", value: "Implemented" },
  { label: "Audited", value: "Audited" },
  { label: "Needs rework", value: "Needs rework" },
];

const GenericFramework = ({
  projectId: propProjectId,
  frameworkId: propFrameworkId,
}: GenericFrameworkProps = {}) => {
  const params = useParams<{ frameworkId: string; projectId: string }>();
  const { userId, userRoleName } = useAuth();

  const fwIdNum = propFrameworkId ?? (params.frameworkId ? parseInt(params.frameworkId, 10) : NaN);
  const projectIdNum = propProjectId ?? (params.projectId ? parseInt(params.projectId, 10) : NaN);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TreeResponse | null>(null);
  const [expanded, setExpanded] = useState<number | false>(false);
  const [selected, setSelected] = useState<SelectedRow | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [flashingRowId, setFlashingRowId] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTree = useCallback(async () => {
    if (!Number.isFinite(fwIdNum) || !Number.isFinite(projectIdNum)) {
      setError("Invalid framework or project id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getEntityById({
        routeUrl: `/frameworks/${fwIdNum}/tree/${projectIdNum}`,
      });
      if (response?.data) {
        setData(response.data as TreeResponse);
      } else {
        setError("Empty response");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load framework");
    } finally {
      setLoading(false);
    }
  }, [fwIdNum, projectIdNum]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree, refreshTrigger]);

  // Progress = # of trackable rows with status "Implemented" over total
  // trackable rows. For two-level frameworks we count L2 impls; for three-
  // level frameworks we count both L2 and L3 (both have their own status
  // and drawer, so both contribute to overall completion).
  const progress = useMemo(() => {
    if (!data) return { completed: 0, total: 0, title: "Items" };
    const isThreeLevel = data.framework.hierarchy_type === "three_level";
    let total = 0;
    let completed = 0;
    for (const l1 of data.tree) {
      for (const l2 of l1.children) {
        if (l2.impl_id != null) {
          total += 1;
          if (l2.status === "Implemented") completed += 1;
        }
        if (isThreeLevel) {
          for (const l3 of l2.children || []) {
            if (l3.impl_id != null) {
              total += 1;
              if (l3.status === "Implemented") completed += 1;
            }
          }
        }
      }
    }
    return {
      completed,
      total,
      title: pluralizeEntityType(data.framework.entity_types.l2_impl),
    };
  }, [data]);

  const drawerProps = useMemo(() => {
    if (!selected || !data) return null;
    const entityType =
      selected.level === "l2"
        ? data.framework.entity_types.l2_impl
        : data.framework.entity_types.l3_impl || "";
    // Matches NotesAttachedToEnum values in Servers/domain.layer/models/notes/notes.model.ts.
    const notesAttachedTo = `${data.framework.framework_type.toUpperCase()}_${entityType.toUpperCase()}`;
    return {
      frameworkId: data.framework.id,
      frameworkType: data.framework.framework_type,
      entityType,
      level: selected.level,
      entityId: selected.node.impl_id!,
      projectFrameworkId: data.projects_frameworks_id,
      project_id: projectIdNum,
      title: selected.node.title,
      summary: selected.node.summary,
      questions: selected.node.questions,
      evidenceExamples: selected.node.evidence_examples,
      notesAttachedTo,
    };
  }, [selected, data, projectIdNum]);

  const handleAccordionChange =
    (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  const handleRowClick = useCallback((level: "l2" | "l3", node: TreeNode) => {
    if (node.impl_id == null) return;
    setSelected({ level, node });
  }, []);

  const handleDrawerClose = () => {
    setSelected(null);
  };

  const handleSaveSuccess = (success: boolean, message?: string, savedRowId?: number) => {
    handleAlert({
      variant: success ? "success" : "error",
      body: message || (success ? "Changes saved successfully" : "Failed to save changes"),
      setAlert,
    });
    if (success) {
      // Refresh on any successful save. Flash only when we have a concrete row
      // id — guard with != null (not truthiness) so a legitimate id of 0 still
      // flashes and never blocks the refresh.
      if (savedRowId != null) {
        setFlashingRowId(savedRowId);
        setTimeout(() => setFlashingRowId(null), 2000);
      }
      setRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleStatusChange = async (
    level: "l2" | "l3",
    node: TreeNode,
    newStatus: string,
  ): Promise<boolean> => {
    if (node.impl_id == null || !data) return false;
    const success = await updateGenericImplStatus({
      frameworkId: data.framework.id,
      level,
      implId: node.impl_id,
      newStatus,
      userId: userId || 1,
    });
    if (success) {
      // Patch only the changed row in local state. Avoids the whole-tree
      // refetch (and cascading re-render) that setRefreshTrigger would cause.
      const targetImplId = node.impl_id;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tree: prev.tree.map((l1) => ({
            ...l1,
            children: (l1.children ?? []).map((l2) => {
              if (level === "l2" && l2.impl_id === targetImplId) {
                return { ...l2, status: newStatus };
              }
              if (level === "l3" && l2.children?.length) {
                return {
                  ...l2,
                  children: l2.children.map((l3) =>
                    l3.impl_id === targetImplId ? { ...l3, status: newStatus } : l3,
                  ),
                };
              }
              return l2;
            }),
          })),
        };
      });
      handleAlert({
        variant: "success",
        body: "Status updated successfully",
        setAlert,
      });
      setFlashingRowId(targetImplId);
      setTimeout(() => setFlashingRowId(null), 2000);
    } else {
      handleAlert({
        variant: "error",
        body: "Failed to update status",
        setAlert,
      });
    }
    return success;
  };

  const matchesStatus = (status?: string | null) =>
    !statusFilter || (status ?? "Not started").toLowerCase() === statusFilter.toLowerCase();

  const filteredL1 = useMemo(() => {
    if (!data) return [];
    if (!searchTerm.trim()) return data.tree;
    const q = searchTerm.toLowerCase();
    return data.tree.filter((l1) => l1.title?.toLowerCase().includes(q));
  }, [data, searchTerm]);

  const renderL2 = (l1: L1Node) => {
    const isThreeLevel = data?.framework.hierarchy_type === "three_level";
    type RenderRow =
      | { kind: "l2"; node: TreeNode; label: string }
      | { kind: "l3"; node: TreeNode; label: string };
    const rows: RenderRow[] = [];
    const l1Prefix = l1.order_no ?? "";

    l1.children.forEach((l2, l2Index) => {
      const l2Matches = matchesStatus(l2.status);
      const l3Filtered = isThreeLevel
        ? (l2.children || []).filter((l3) => matchesStatus(l3.status))
        : [];

      if (isThreeLevel && !l2Matches && l3Filtered.length === 0) return;
      if (!isThreeLevel && !l2Matches) return;

      const l2Num = l2.order_no ?? l2Index + 1;
      const l2Label = `${l1Prefix}.${l2Num}`;
      rows.push({ kind: "l2", node: l2, label: l2Label });

      l3Filtered.forEach((l3, l3Index) => {
        const l3Num = l3.order_no ?? l3Index + 1;
        rows.push({ kind: "l3", node: l3, label: `${l2Label}.${l3Num}` });
      });
    });

    if (rows.length === 0) {
      return (
        <AccordionDetails sx={{ padding: 0 }}>
          <Stack sx={styles.noSubClausesContainer}>No matching items</Stack>
        </AccordionDetails>
      );
    }

    return (
      <AccordionDetails sx={{ padding: 0 }}>
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1;
          if (row.kind === "l3") {
            return (
              <Stack
                key={`l3-${row.node.struct_id}`}
                onClick={() => handleRowClick("l3", row.node)}
                sx={{
                  ...styles.subClauseRow(isLast, flashingRowId === row.node.impl_id),
                  padding: "16px 16px 16px 40px",
                }}
              >
                <Typography fontSize={13}>
                  {row.label} {row.node.title}
                </Typography>
                <StatusDropdown
                  currentStatus={row.node.status ?? "Not started"}
                  onStatusChange={(newStatus) => handleStatusChange("l3", row.node, newStatus)}
                  size="small"
                  allowedRoles={allowedRoles.frameworks.edit}
                  userRole={userRoleName}
                />
              </Stack>
            );
          }
          return (
            <Stack
              key={`l2-${row.node.struct_id}`}
              onClick={() => handleRowClick("l2", row.node)}
              sx={styles.subClauseRow(isLast, flashingRowId === row.node.impl_id)}
            >
              <Typography fontSize={13}>
                {row.label} {row.node.title}
              </Typography>
              <StatusDropdown
                currentStatus={row.node.status ?? "Not started"}
                onStatusChange={(newStatus) => handleStatusChange("l2", row.node, newStatus)}
                size="small"
                allowedRoles={allowedRoles.frameworks.edit}
                userRole={userRoleName}
              />
            </Stack>
          );
        })}
      </AccordionDetails>
    );
  };

  if (loading) {
    return (
      <Stack sx={styles.loadingContainer}>
        <CircularProgress />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack sx={styles.errorContainer}>
        <Typography color="error">{error}</Typography>
      </Stack>
    );
  }

  if (!data) return null;

  return (
    <Stack className={`generic-framework-${data.framework.key}`}>
      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
      <Typography sx={{ ...styles.title, mt: 4 }}>{data.framework.display_name}</Typography>
      <TabFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        showStatusFilter={true}
        statusOptions={STATUS_OPTIONS}
        showSearchBar={true}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm as any}
      />
      {progress.total > 0 && (
        <Stack sx={{ mt: 2 }}>
          <StatsCard
            title={progress.title}
            completed={progress.completed}
            total={progress.total}
            progressbarColor={brand.primary}
          />
        </Stack>
      )}
      {filteredL1.map((l1) => (
        <Stack key={l1.id} sx={styles.container}>
          <Accordion
            key={l1.id}
            expanded={expanded === l1.id}
            sx={styles.accordion}
            onChange={handleAccordionChange(l1.id)}
          >
            <AccordionSummary sx={styles.accordionSummary}>
              <RightArrowBlack
                size={16}
                style={styles.expandIcon(expanded === l1.id) as React.CSSProperties}
              />
              <Typography sx={{ paddingLeft: "2.5px", fontSize: 13 }}>
                {l1.order_no != null ? `${l1.order_no} ` : ""}
                {l1.title}
              </Typography>
            </AccordionSummary>
            {renderL2(l1)}
          </Accordion>
        </Stack>
      ))}
      {drawerProps && (
        <GenericFrameworkDrawer
          open={selected !== null}
          onClose={handleDrawerClose}
          drawerClassName={`generic-framework-drawer-${data.framework.key}`}
          onSaveSuccess={(ok, message) =>
            handleSaveSuccess(ok, message, selected?.node.impl_id ?? undefined)
          }
          {...drawerProps}
        />
      )}
    </Stack>
  );
};

export default GenericFramework;
