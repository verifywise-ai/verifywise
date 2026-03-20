import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Stack,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableFooter,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import { Plus, FileSearch, MessageSquare, Bot, ChevronsUpDown, ChevronUp, ChevronDown, MoreVertical, FlaskConical, Target, Layers, TrendingUp } from "lucide-react";
import { PageHeader } from "../../components/Layout/PageHeader";
import SelectableCard from "../../components/SelectableCard";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Alert from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import TablePaginationActions from "../../components/TablePagination";
import SearchBox from "../../components/Search/SearchBox";
import { FilterBy, type FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import {
  getAllProjects,
  getProjectStats,
  createProject,
  updateProject,
  deleteProject,
  getAllExperiments,
} from "../../../application/repository/deepEval.repository";
import singleTheme from "../../themes/v1SingleTheme";
import type { DeepEvalProject } from "./types";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { palette } from "../../themes/palette";

const EVALS_PROJECTS_ROWS_PER_PAGE_KEY = "verifywise_evals_projects_rows_per_page";
const EVALS_PROJECTS_SORTING_KEY = "verifywise_evals_projects_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const columns = [
  { id: "name", label: "Name", minWidth: 180, sortable: true, align: "left" as const },
  { id: "useCase", label: "Use case", minWidth: 120, sortable: true, align: "center" as const },
  { id: "description", label: "Description", minWidth: 200, sortable: false, align: "center" as const },
  { id: "runs", label: "Runs", minWidth: 100, sortable: true, align: "center" as const },
  { id: "created", label: "Created", minWidth: 140, sortable: true, align: "center" as const },
  { id: "actions", label: "Action", minWidth: 80, sortable: false, align: "center" as const },
];

export default function ProjectsList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [projects, setProjects] = useState<DeepEvalProject[]>([]);
  const [runsByProject, setRunsByProject] = useState<Record<string, number>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    body: string;
  } | null>(null);

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(EVALS_PROJECTS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });

  // Sorting state - default to date desc
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(EVALS_PROJECTS_SORTING_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If saved state is empty, use the default
        if (!parsed.key || !parsed.direction) {
          return { key: "created", direction: "desc" };
        }
        return parsed;
      } catch {
        return { key: "created", direction: "desc" };
      }
    }
    return { key: "created", direction: "desc" };
  });

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(EVALS_PROJECTS_ROWS_PER_PAGE_KEY, rowsPerPage.toString());
  }, [rowsPerPage]);

  useEffect(() => {
    localStorage.setItem(EVALS_PROJECTS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // RBAC permissions
  const { userRoleName } = useAuth();
  const canCreateProject = allowedRoles.evals.createProject.includes(userRoleName);
  const canEditProject = allowedRoles.evals.editProject.includes(userRoleName);
  const canDeleteProject = allowedRoles.evals.deleteProject.includes(userRoleName);

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");

  const filterColumns: FilterColumn[] = [
    { id: "name", label: "Project name", type: "text" },
    { id: "useCase", label: "Use case", type: "select", options: [
      { label: "Chatbot", value: "chatbot" },
      { label: "RAG", value: "rag" },
      { label: "Agent", value: "agent" },
    ]},
  ];

  const getFieldValue = useCallback(
    (project: DeepEvalProject, field: string): string => {
      switch (field) {
        case "name":
          return project.name;
        case "useCase":
          return project.useCase || "";
        default:
          return "";
      }
    },
    []
  );

  const { filterData, handleFilterChange } = useFilterBy<DeepEvalProject>(getFieldValue);

  const filteredProjects = useMemo(() => {
    const afterFilter = filterData(projects);
    if (!searchTerm.trim()) return afterFilter;
    const q = searchTerm.toLowerCase();
    return afterFilter.filter((p) =>
      [p.name, p.description, p.useCase]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [projects, filterData, searchTerm]);

  const [newProject, setNewProject] = useState<{ name: string; description: string; useCase: "chatbot" | "rag" | "agent" }>({
    name: "",
    description: "",
    useCase: "chatbot",
  });

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<DeepEvalProject | null>(null);
  const [editProjectData, setEditProjectData] = useState({
    name: "",
    description: "",
  });

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<DeepEvalProject | null>(null);

  // Action menu state
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuProject, setMenuProject] = useState<DeepEvalProject | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await getAllProjects();
      const list = data.projects || [];
      setProjects(list);

      // Fetch run counts for each project in parallel
      const statsArray = await Promise.all(
        (list || []).map(async (p) => {
          try {
            const res = await getAllExperiments({ project_id: p.id });
            const total = Array.isArray(res?.experiments) ? res.experiments.length : (res?.length ?? 0);
            return { id: p.id, total };
          } catch {
            try {
              const res = await getProjectStats(p.id);
              return { id: p.id, total: res.stats.totalExperiments ?? 0 };
            } catch {
              return { id: p.id, total: 0 };
            }
          }
        })
      );
      const counts: Record<string, number> = {};
      statsArray.forEach((s) => {
        counts[s.id] = s.total;
      });
      setRunsByProject(counts);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setProjects([]);
      setRunsByProject({});
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Sorting handler
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort projects (uses filtered results)
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (!sortConfig.key || !sortConfig.direction) return 0;

    let aValue: string | number;
    let bValue: string | number;

    switch (sortConfig.key) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "useCase":
        aValue = (a.useCase || "chatbot").toLowerCase();
        bValue = (b.useCase || "chatbot").toLowerCase();
        break;
      case "runs":
        aValue = runsByProject[a.id] ?? 0;
        bValue = runsByProject[b.id] ?? 0;
        break;
      case "created":
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      default:
        return 0;
    }

    if (typeof aValue === "string" && typeof bValue === "string") {
      const comparison = aValue.localeCompare(bValue);
      return sortConfig.direction === "asc" ? comparison : -comparison;
    }

    if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Pagination
  const paginatedProjects = sortedProjects.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = useCallback((_event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  const handleCreateProject = async () => {
    setLoading(true);
    try {
      const projectConfig = {
        name: newProject.name,
        description: newProject.description,
        useCase: newProject.useCase,
        defaultDataset: newProject.useCase,
      };

      await createProject(projectConfig);

      setAlert({
        variant: "success",
        body: `Project "${newProject.name}" created successfully!`,
      });
      setTimeout(() => setAlert(null), 5000);

      setCreateModalOpen(false);
      setNewProject({ name: "", description: "", useCase: "chatbot" });

      loadProjects();
    } catch (err) {
      setAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to create project",
      });
      setTimeout(() => setAlert(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/evals/${projectId}#overview`);
  };

  const handleUpdateProject = async () => {
    if (!editingProject) return;
    setLoading(true);
    try {
      await updateProject(editingProject.id, editProjectData);
      setAlert({
        variant: "success",
        body: `Project "${editProjectData.name}" updated successfully!`,
      });
      setTimeout(() => setAlert(null), 5000);
      setEditModalOpen(false);
      setEditingProject(null);
      loadProjects();
    } catch (err) {
      setAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to update project",
      });
      setTimeout(() => setAlert(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setLoading(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setRunsByProject((prev) => {
        const next = { ...prev };
        delete next[projectToDelete.id];
        return next;
      });
      setAlert({ variant: "success", body: "Project deleted" });
      setTimeout(() => setAlert(null), 4000);
      setDeleteModalOpen(false);
      setProjectToDelete(null);
    } catch (err) {
      setAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to delete project" });
      setTimeout(() => setAlert(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, project: DeepEvalProject) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuProject(project);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuProject(null);
  };

  const handleMenuEdit = () => {
    if (menuProject) {
      setEditingProject(menuProject);
      setEditProjectData({
        name: menuProject.name,
        description: menuProject.description || "",
      });
      setEditModalOpen(true);
    }
    handleMenuClose();
  };

  const handleMenuDelete = () => {
    if (menuProject) {
      setProjectToDelete(menuProject);
      setDeleteModalOpen(true);
    }
    handleMenuClose();
  };

  const getUseCaseLabel = (useCase: string | undefined) => {
    switch (useCase) {
      case "rag":
        return "RAG";
      case "chatbot":
        return "Chatbot";
      case "agent":
        return "Agent";
      default:
        return "Chatbot";
    }
  };

  const getRange = () => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedProjects.length);
    return `${start} - ${end}`;
  };

  return (
    <Stack sx={{ width: "100%" }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      <PageHeader
        title="Projects"
        description="Projects organize your LLM evaluations. Each project groups related experiments, datasets, and configurations for a specific use case."
        rightContent={
          projects.length > 0 ? (
            <Chip
              label={projects.length}
              size="small"
              sx={{
                backgroundColor: palette.status.default.bg,
                color: palette.status.default.text,
                fontWeight: 600,
                fontSize: "11px",
                height: "20px",
                minWidth: "20px",
                borderRadius: "10px",
                "& .MuiChip-label": {
                  padding: "0 6px",
                },
              }}
            />
          ) : undefined
        }
      />

      {/* Controls row */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ marginTop: "18px", marginBottom: "18px" }}
        gap={2}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <FilterBy columns={filterColumns} onFilterChange={handleFilterChange} />
          <GroupBy
            options={[
              { id: "useCase", label: "Use case" },
            ]}
            onGroupChange={() => {}}
          />
          <SearchBox
            placeholder="Search projects..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search projects" }}
            fullWidth={false}
          />
        </Stack>
        <CustomizableButton
          onClick={() => setCreateModalOpen(true)}
          variant="contained"
          text="Create project"
          icon={<Plus size={16} />}
          isDisabled={!canCreateProject}
          sx={{
            backgroundColor: palette.brand.primary,
            border: `1px solid ${palette.brand.primary}`,
            gap: 2,
          }}
        />
      </Stack>

      {/* Projects Table */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          message={
            projects.length === 0
              ? "No evaluation projects yet. Create a project to start benchmarking your LLM applications."
              : "No projects match your search or filter criteria."
          }
          showBorder
        >
          {projects.length === 0 && (
            <>
              <EmptyStateTip
                icon={Target}
                title="What is an eval project?"
                description="A project groups related evaluations for a single LLM application. Define test suites, scoring criteria, and track quality over time."
              />
              <EmptyStateTip
                icon={Layers}
                title="Compare models side by side"
                description="Run the same test suite across different models or prompts. The arena view shows head-to-head comparisons with automated scoring."
              />
              <EmptyStateTip
                icon={TrendingUp}
                title="Track quality over releases"
                description="Re-run evaluations after each deployment. Monitor regression and improvement trends with historical score charts."
              />
            </>
          )}
        </EmptyState>
      ) : (
        <TableContainer>
          <Table sx={singleTheme.tableStyles.primary.frame}>
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
                      cursor: column.sortable ? "pointer" : "default",
                      userSelect: "none",
                      textAlign: column.align,
                      "&:hover": column.sortable ? {
                        backgroundColor: "rgba(0, 0, 0, 0.04)",
                      } : {},
                    }}
                    onClick={() => column.sortable && handleSort(column.id)}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: column.align === "center" ? "center" : "flex-start",
                        gap: 0.5,
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
                            color: sortConfig.key === column.id ? "primary.main" : palette.text.disabled,
                            flexShrink: 0,
                          }}
                        >
                          {sortConfig.key === column.id && sortConfig.direction === "asc" && <ChevronUp size={14} />}
                          {sortConfig.key === column.id && sortConfig.direction === "desc" && <ChevronDown size={14} />}
                          {sortConfig.key !== column.id && <ChevronsUpDown size={14} />}
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedProjects.map((project) => (
                <TableRow
                  key={project.id}
                  onClick={() => handleOpenProject(project.id)}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: palette.background.accent,
                    },
                  }}
                >
                  {/* Name - Left aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      color: palette.text.primary,
                      textAlign: "left",
                    }}
                  >
                    {project.name}
                  </TableCell>
                  {/* Use Case - Center aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    <Chip
                      size="small"
                      icon={project.useCase === "rag" ? <FileSearch size={12} /> : <MessageSquare size={12} />}
                      label={getUseCaseLabel(project.useCase)}
                      sx={{
                        backgroundColor: project.useCase === "rag" ? palette.accent.blue.bg : palette.status.success.bg,
                        color: project.useCase === "rag" ? palette.accent.blue.text : palette.status.success.text,
                        fontWeight: 500,
                        fontSize: "12px",
                        height: "24px",
                        borderRadius: "4px",
                        "& .MuiChip-icon": {
                          color: "inherit",
                          marginLeft: "8px",
                        },
                      }}
                    />
                  </TableCell>
                  {/* Description - Center aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      color: palette.text.tertiary,
                      textAlign: "center",
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.description || "-"}
                  </TableCell>
                  {/* Runs - Center aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    <Chip
                      size="small"
                      label={runsByProject[project.id] ?? 0}
                      sx={{
                        backgroundColor: palette.background.hover,
                        color: palette.text.secondary,
                        fontWeight: 500,
                        fontSize: "12px",
                        height: "22px",
                        minWidth: "32px",
                        borderRadius: "4px",
                      }}
                    />
                  </TableCell>
                  {/* Created - Center aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontSize: "13px",
                      color: palette.text.tertiary,
                      textAlign: "center",
                    }}
                  >
                    {formatDate(project.createdAt)}
                  </TableCell>
                  {/* Action - Center aligned */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      textAlign: "center",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(canEditProject || canDeleteProject) && (
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, project)}
                        sx={{
                          color: palette.text.tertiary,
                          "&:hover": {
                            backgroundColor: "rgba(0, 0, 0, 0.04)",
                          },
                        }}
                      >
                        <MoreVertical size={18} />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
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
                  colSpan={3}
                >
                  Showing {getRange()} of {sortedProjects.length} project(s)
                </TableCell>
                <TablePagination
                  count={sortedProjects.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[5, 10, 15, 20, 25]}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={(props) => <TablePaginationActions {...props} />}
                  labelRowsPerPage="Projects per page"
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
                      IconComponent: () => <ChevronsUpDown size={16} />,
                      sx: {
                        ml: theme.spacing(4),
                        mr: theme.spacing(12),
                        minWidth: theme.spacing(20),
                        textAlign: "left",
                        "&.Mui-focused > div": {
                          backgroundColor: theme.palette.background.main,
                        },
                      },
                    },
                  }}
                  sx={{
                    mt: theme.spacing(6),
                    color: theme.palette.text.secondary,
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
          </Table>
        </TableContainer>
      )}

      {/* Action Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        slotProps={{
          paper: {
            sx: singleTheme.dropDownStyles.primary,
          },
        }}
      >
        {canEditProject && (
          <MenuItem onClick={handleMenuEdit}>
            Edit
          </MenuItem>
        )}
        {canDeleteProject && (
          <MenuItem onClick={handleMenuDelete} sx={{ color: palette.status.error.text }}>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Create Project Modal */}
      <StandardModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create project"
        description="Create a new project to organize your LLM evaluations"
        onSubmit={handleCreateProject}
        submitButtonText="Create project"
        isSubmitting={loading || !newProject.name}
      >
        <Stack spacing="8px">
          <Field
            label="Project name"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            placeholder="e.g., Coding Tasks Evaluation"
            isRequired
          />

          {/* LLM Use Case - card selection */}
          <Box>
            <Box sx={{ fontSize: "12px", color: palette.text.secondary, mb: "8px", fontWeight: 600 }}>
              LLM use case
            </Box>
            <Stack spacing="8px">
              <SelectableCard
                isSelected={newProject.useCase === "rag"}
                onClick={() => setNewProject({ ...newProject, useCase: "rag" })}
                icon={<FileSearch size={16} color={newProject.useCase === "rag" ? palette.brand.primary : palette.text.disabled} />}
                title="RAG"
                description="Evaluate retrieval-augmented generation: recall, precision, relevancy and faithfulness."
              />
              <SelectableCard
                isSelected={newProject.useCase === "chatbot"}
                onClick={() => setNewProject({ ...newProject, useCase: "chatbot" })}
                icon={<MessageSquare size={16} color={newProject.useCase === "chatbot" ? palette.brand.primary : palette.text.disabled} />}
                title="Chatbots"
                description="Evaluate conversational experiences for coherence, correctness and safety."
              />
              <SelectableCard
                isSelected={newProject.useCase === "agent"}
                onClick={() => setNewProject({ ...newProject, useCase: "agent" })}
                icon={<Bot size={16} color={newProject.useCase === "agent" ? palette.brand.primary : palette.text.disabled} />}
                title="Agent"
                description="Evaluate AI agents for planning, tool usage, and task completion."
              />
            </Stack>
          </Box>
        </Stack>
      </StandardModal>

      {/* Edit Project Modal */}
      <StandardModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingProject(null);
        }}
        title="Edit project"
        description="Update the project name and description"
        onSubmit={handleUpdateProject}
        submitButtonText="Save changes"
        isSubmitting={loading || !editProjectData.name}
      >
        <Stack spacing={3}>
          <Field
            label="Project name"
            value={editProjectData.name}
            onChange={(e) => setEditProjectData({ ...editProjectData, name: e.target.value })}
            placeholder="e.g., Coding Tasks Evaluation"
            isRequired
          />

          <Field
            label="Description"
            value={editProjectData.description}
            onChange={(e) => setEditProjectData({ ...editProjectData, description: e.target.value })}
            placeholder="Brief description of this project..."
          />
        </Stack>
      </StandardModal>

      {/* Delete Project Confirmation Modal */}
      {deleteModalOpen && projectToDelete && (
        <ConfirmationModal
          isOpen={deleteModalOpen}
          title="Delete this project?"
          body={
            <Typography fontSize={13} color={palette.text.secondary}>
              This will remove the project and its experiments. This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          onCancel={() => {
            setDeleteModalOpen(false);
            setProjectToDelete(null);
          }}
          onProceed={handleConfirmDelete}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
    </Stack>
  );
}
