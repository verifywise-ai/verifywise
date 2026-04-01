import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  IconButton,
  Menu,
  MenuItem,
  Box,
  Typography,
} from "@mui/material";
import { Plus, FileSearch, MessageSquare, Bot, MoreVertical, FlaskConical, Target, Layers, TrendingUp } from "lucide-react";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
import type { StandardColumn } from "../../../domain/types/standardTable";
import { PageHeader } from "../../components/Layout/PageHeader";
import SelectableCard from "../../components/SelectableCard";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Alert from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
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

const columns: StandardColumn[] = [
  { id: "name", label: "Name", minWidth: "180px", sortable: true, align: "left" },
  { id: "useCase", label: "Use case", minWidth: "120px", sortable: true, align: "center" },
  { id: "description", label: "Description", minWidth: "200px", sortable: false, align: "center" },
  { id: "runs", label: "Runs", minWidth: "100px", sortable: true, align: "center" },
  { id: "created", label: "Created", minWidth: "140px", sortable: true, align: "center" },
  { id: "actions", label: "Action", minWidth: "80px", sortable: false, align: "center" },
];

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<DeepEvalProject[]>([]);
  const [runsByProject, setRunsByProject] = useState<Record<string, number>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    body: string;
  } | null>(null);

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

  // Sort comparator for useStandardTable
  const sortComparator = useCallback(
    (a: DeepEvalProject, b: DeepEvalProject, key: string): number => {
      switch (key) {
        case "name":
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case "useCase":
          return (a.useCase || "chatbot").toLowerCase().localeCompare((b.useCase || "chatbot").toLowerCase());
        case "runs":
          return (runsByProject[a.id] ?? 0) - (runsByProject[b.id] ?? 0);
        case "created":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return 0;
      }
    },
    [runsByProject]
  );

  const {
    sortConfig, handleSort, sortedRows, validPage, rowsPerPage,
    handleChangePage, handleChangeRowsPerPage, getRange, totalCount,
  } = useStandardTable<DeepEvalProject>({
    rows: filteredProjects,
    storageKey: "evals_projects",
    defaultSortColumn: "created",
    defaultSortDirection: "desc",
    sortComparator,
  });

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
            <StandardTableHead columns={columns} sortConfig={sortConfig} onSort={handleSort} />
            <TableBody>
              {sortedRows.slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage).map((project) => (
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
            <StandardTablePagination
              totalCount={totalCount}
              page={validPage}
              rowsPerPage={rowsPerPage}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              getRange={getRange}
              entityLabel="project"
              colSpan={columns.length}
            />
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
