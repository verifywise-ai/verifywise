import React, { useState, useMemo, useCallback, useEffect, useContext } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableFooter,
  Typography,
  useTheme,
  Box,
  Stack,
} from "@mui/material";
import useNavigateSearch from "../../../application/hooks/useNavigateSearch";
import singleTheme from "../../themes/v1SingleTheme";
import TablePaginationActions from "../../components/TablePagination";
import { EmptyState } from "../EmptyState";
import Chip from "../Chip";
import ViewRelationshipsButton from "../ViewRelationshipsButton";
import IconButton from "../IconButton";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Briefcase,
  PlusCircle,
  Target,
  Link2,
} from "lucide-react";
import EmptyStateTip from "../EmptyState/EmptyStateTip";
import { TableEmptyStateLayout } from "../Table/TableEmptyStateLayout";
import { IProjectTableViewProps } from "../../../domain/interfaces/i.project";
import { Project } from "../../../domain/types/Project";
import { deleteProject } from "../../../application/repository/project.repository";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import Alert from "../Alert";
import allowedRoles from "../../../application/constants/permissions";
import { useAuth } from "../../../application/hooks/useAuth";
import { text } from "../../themes/palette";
import useUsers from "../../../application/hooks/useUsers";
import { useCustomFieldDefinitions } from "../../../application/hooks/useCustomFields";
import { formatCustomFieldValue } from "../CustomFieldsSection/formatCustomFieldValue";

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

const PROJECT_ROWS_PER_PAGE_KEY = "verifywise_project_rows_per_page";
const PROJECT_SORTING_KEY = "verifywise_project_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const columns = [
  { id: "ucId", label: "Use case ID", minWidth: 120, sortable: true },
  { id: "title", label: "Use case title", minWidth: 200, sortable: true },
  { id: "risk", label: "AI risk level", minWidth: 130, sortable: true },
  { id: "role", label: "Role", minWidth: 150, sortable: true },
  { id: "startDate", label: "Start date", minWidth: 120, sortable: true },
  { id: "lastUpdated", label: "Last updated", minWidth: 120, sortable: true },
  { id: "actions", label: "", minWidth: 80, sortable: false },
];

// Sortable Table Header Component
const SortableTableHeader: React.FC<{
  columns: typeof columns;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}> = ({ columns, sortConfig, onSort }) => {
  const theme = useTheme();

  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              minWidth: column.minWidth,
              ...(column.sortable && {
                "cursor": "pointer",
                "userSelect": "none",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }),
              ...(column.id === "ucId" && {
                width: column.minWidth,
                maxWidth: column.minWidth,
              }),
            }}
            onClick={() => column.sortable && onSort(column.id)}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: theme.spacing(2),
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: sortConfig.key === column.id ? "primary.main" : "inherit",
                }}
              >
                {column.label}
              </Typography>
              {column.sortable && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: sortConfig.key === column.id ? "primary.main" : `${text.disabled}`,
                  }}
                >
                  {sortConfig.key === column.id && sortConfig.direction === "asc" && (
                    <ChevronUp size={16} />
                  )}
                  {sortConfig.key === column.id && sortConfig.direction === "desc" && (
                    <ChevronDown size={16} />
                  )}
                  {sortConfig.key !== column.id && <ChevronsUpDown size={16} />}
                </Box>
              )}
            </Box>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

const ProjectTableView: React.FC<IProjectTableViewProps> = ({
  projects,
  hidePagination = false,
  onProjectDeleted,
  visibleColumns,
}) => {
  const theme = useTheme();
  const navigate = useNavigateSearch();
  const { setProjects } = useContext(VerifyWiseContext);
  const { userRoleName } = useAuth();
  const [page, setPage] = useState(0);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  // Initialize rowsPerPage from localStorage or default to 10
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(PROJECT_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(PROJECT_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save rowsPerPage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(PROJECT_ROWS_PER_PAGE_KEY, rowsPerPage.toString());
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(PROJECT_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const { users } = useUsers();
  const { data: customFieldDefs = [] } = useCustomFieldDefinitions("project");

  // Filter columns based on visibility, then append custom field columns
  // before the actions column.
  const visibleColumnsArray = useMemo(() => {
    const filtered =
      !visibleColumns || visibleColumns.size === 0
        ? columns
        : columns.filter((col) => visibleColumns.has(col.id));
    const customCols = customFieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      minWidth: 140,
      sortable: false,
    }));
    const actionsIdx = filtered.findIndex((c) => c.id === "actions");
    if (actionsIdx === -1) return [...filtered, ...customCols];
    return [...filtered.slice(0, actionsIdx), ...customCols, ...filtered.slice(actionsIdx)];
  }, [visibleColumns, customFieldDefs]);

  // Helper to check if column is visible (defaults to true if no visibility set)
  const isColumnVisible = useCallback(
    (columnId: string) => {
      if (!visibleColumns || visibleColumns.size === 0) return true;
      return visibleColumns.has(columnId);
    },
    [visibleColumns],
  );

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleChangePage = useCallback((_event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const handleRowClick = (projectId: number) => {
    navigate("/project-view", { projectId: projectId.toString() });
  };

  const handleEditProject = useCallback(
    (projectId: number) => {
      navigate("/project-view", { projectId: projectId.toString(), tab: "settings" });
    },
    [navigate],
  );

  const handleDeleteProject = useCallback(
    async (projectId: number) => {
      try {
        const response = await deleteProject({ id: projectId });
        const isError = response.status === 404 || response.status === 500;

        setAlert({
          variant: isError ? "error" : "success",
          title: isError ? "Error" : "Success",
          body: isError
            ? "Failed to delete use case. Please try again."
            : "Use case deleted successfully.",
        });

        if (!isError) {
          setProjects((prevProjects) => prevProjects.filter((project) => project.id !== projectId));
          // Call the callback if provided to refresh the parent component
          if (onProjectDeleted) {
            onProjectDeleted();
          }
        }

        setTimeout(() => {
          setAlert(null);
        }, 3000);
      } catch (error) {
        console.error("Error deleting project:", error);
        setAlert({
          variant: "error",
          title: "Error",
          body: "Failed to delete use case. Please try again.",
        });
        setTimeout(() => {
          setAlert(null);
        }, 3000);
      }
    },
    [setProjects, onProjectDeleted],
  );

  // Sort the projects based on current sort configuration
  const sortedProjects = useMemo(() => {
    if (!projects || !sortConfig.key || !sortConfig.direction) {
      return projects || [];
    }

    const sortableProjects = [...projects];

    return sortableProjects.sort((a: Project, b: Project) => {
      // Risk level order: High > Limited > Minimal
      // Handle various possible formats of risk levels
      const getRiskValue = (risk: string) => {
        const riskLower = risk.toLowerCase().trim();
        if (riskLower.includes("high")) return 3;
        if (riskLower.includes("limited")) return 2;
        if (riskLower.includes("minimal")) return 1;
        return 0; // fallback for unknown risk levels
      };

      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "ucId":
          aValue = a.uc_id ? a.uc_id.toLowerCase() : "";
          bValue = b.uc_id ? b.uc_id.toLowerCase() : "";
          break;

        case "title":
          aValue = a.project_title.toLowerCase();
          bValue = b.project_title.toLowerCase();
          break;

        case "risk":
          aValue = getRiskValue(a.ai_risk_classification);
          bValue = getRiskValue(b.ai_risk_classification);
          break;

        case "role":
          aValue = (a.type_of_high_risk_role || "").toLowerCase();
          bValue = (b.type_of_high_risk_role || "").toLowerCase();
          break;

        case "startDate":
          aValue = new Date(a.start_date).getTime();
          bValue = new Date(b.start_date).getTime();
          break;

        case "lastUpdated":
          aValue = new Date(a.last_updated).getTime();
          bValue = new Date(b.last_updated).getTime();
          break;

        default:
          return 0;
      }

      // Handle string comparisons
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      // Handle number comparisons
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [projects, sortConfig]);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedProjects.length);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedProjects.length]);

  const paginatedProjects = useMemo(() => {
    return sortedProjects.slice(
      hidePagination ? 0 : page * rowsPerPage,
      hidePagination ? Math.min(sortedProjects.length, 100) : page * rowsPerPage + rowsPerPage,
    );
  }, [sortedProjects, page, rowsPerPage, hidePagination]);

  if (!projects || projects.length === 0) {
    return (
      <TableEmptyStateLayout
        header={
          <SortableTableHeader
            columns={visibleColumnsArray}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        }
      >
        <EmptyState
          icon={Briefcase}
          message="No use cases yet. A use case describes how an AI system is applied within your organization."
        >
          <EmptyStateTip
            icon={PlusCircle}
            title="Create a use case"
            description="Define the AI system, its purpose, the data it processes, and the people it affects. This forms the basis for risk and compliance tracking."
          />
          <EmptyStateTip
            icon={Target}
            title="Scope and classify"
            description="Each use case can be classified by risk level (high, limited, minimal) to determine which compliance controls apply."
          />
          <EmptyStateTip
            icon={Link2}
            title="Link to governance artifacts"
            description="Connect use cases to risks, policies, models, and evidence. This creates full traceability from business need to compliance proof."
          />
        </EmptyState>
      </TableEmptyStateLayout>
    );
  }

  return (
    <>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
      <TableContainer>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <SortableTableHeader
            columns={visibleColumnsArray}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          <TableBody>
            {paginatedProjects.map((project) => (
              <TableRow
                key={project.id}
                onClick={() => handleRowClick(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    if (event.key === " ") {
                      event.preventDefault();
                    }
                    handleRowClick(project.id);
                  }
                }}
                tabIndex={0}
                role="button"
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  "cursor": "pointer",
                  "&:last-child td, &:last-child th": {
                    border: 0,
                  },
                  "&:focus": {
                    outline: "none",
                  },
                }}
              >
                {isColumnVisible("ucId") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: sortConfig.key === "ucId" ? "#e8e8e8" : "#fafafa",
                    }}
                  >
                    {project.uc_id || project.id}
                  </TableCell>
                )}

                {isColumnVisible("title") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      fontWeight: 500,
                      backgroundColor:
                        sortConfig.key === "title" ? "background.surface" : "inherit",
                    }}
                  >
                    {project.project_title}
                  </TableCell>
                )}

                {isColumnVisible("risk") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      backgroundColor: sortConfig.key === "risk" ? "background.surface" : "inherit",
                    }}
                  >
                    <Chip label={project.ai_risk_classification || "—"} />
                  </TableCell>
                )}

                {isColumnVisible("role") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      textTransform: "capitalize",
                      backgroundColor: sortConfig.key === "role" ? "background.surface" : "inherit",
                    }}
                  >
                    {project.type_of_high_risk_role?.replace(/_/g, " ") || "—"}
                  </TableCell>
                )}

                {isColumnVisible("startDate") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      color: "text.tertiary",
                      backgroundColor:
                        sortConfig.key === "startDate" ? "background.surface" : "inherit",
                    }}
                  >
                    {formatDate(project.start_date)}
                  </TableCell>
                )}

                {isColumnVisible("lastUpdated") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      color: "text.tertiary",
                      backgroundColor:
                        sortConfig.key === "lastUpdated" ? "background.surface" : "inherit",
                    }}
                  >
                    {formatDate(project.last_updated)}
                  </TableCell>
                )}

                {customFieldDefs.map((def) => {
                  const match = (project as any).custom_fields?.find(
                    (cf: { definition_id: number; value: unknown }) => cf.definition_id === def.id,
                  );
                  return (
                    <TableCell
                      key={`cf_${def.id}`}
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        fontSize: "13px",
                      }}
                    >
                      {formatCustomFieldValue(def, match?.value, users)}
                    </TableCell>
                  );
                })}

                {isColumnVisible("actions") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <ViewRelationshipsButton
                        entityId={project.id}
                        entityType="useCase"
                        entityLabel={project.project_title}
                      />
                      {allowedRoles.projects.delete.includes(userRoleName) && (
                        <IconButton
                          id={project.id}
                          type="use case"
                          onEdit={() => handleEditProject(project.id)}
                          onDelete={() => {
                            handleDeleteProject(project.id);
                          }}
                          onMouseEvent={() => {}}
                          warningTitle="Delete this use case?"
                          warningMessage="Note that deleting a use case will remove all data related to that use case from your system. This is permanent and non-recoverable."
                        />
                      )}
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {!hidePagination && (
            <TableFooter>
              <TableRow
                sx={{
                  "& .MuiTableCell-root.MuiTableCell-footer": {
                    paddingX: theme.spacing(8),
                    paddingY: theme.spacing(4),
                  },
                }}
              >
                <TableCell
                  sx={{
                    paddingX: theme.spacing(2),
                    fontSize: 12,
                    opacity: 0.7,
                    color: theme.palette.text.tertiary,
                  }}
                  colSpan={2}
                >
                  Showing {getRange} of {sortedProjects.length} use case(s)
                </TableCell>
                <TablePagination
                  count={sortedProjects.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[5, 10, 15, 20, 25]}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={(props) => <TablePaginationActions {...props} />}
                  labelRowsPerPage="Use cases per page"
                  labelDisplayedRows={({ page, count }) =>
                    `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: {
                        keepMounted: true,
                        PaperProps: {
                          className: "pagination-dropdown",
                          sx: {
                            mt: 0,
                            mb: theme.spacing(2),
                          },
                        },
                        transformOrigin: {
                          vertical: "bottom",
                          horizontal: "left",
                        },
                        anchorOrigin: { vertical: "top", horizontal: "left" },
                        sx: { mt: theme.spacing(-2) },
                      },
                      inputProps: { id: "pagination-dropdown" },
                      IconComponent: SelectorVertical,
                      sx: {
                        "ml": theme.spacing(4),
                        "mr": theme.spacing(12),
                        "minWidth": theme.spacing(20),
                        "textAlign": "left",
                        "&.Mui-focused > div": {
                          backgroundColor: theme.palette.background.main,
                        },
                      },
                    },
                  }}
                  sx={{
                    "mt": theme.spacing(6),
                    "color": theme.palette.text.secondary,
                    "& .MuiSelect-icon": {
                      width: "24px",
                      height: "fit-content",
                    },
                    "& .MuiSelect-select": {
                      width: theme.spacing(10),
                      borderRadius: theme.shape.borderRadius,
                      border: `1px solid ${theme.palette.border.light}`,
                      padding: theme.spacing(4),
                    },
                  }}
                />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
    </>
  );
};

export default ProjectTableView;
