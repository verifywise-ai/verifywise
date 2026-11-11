import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  TableRow,
  TableCell,
  Tooltip,
  Typography,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { Copy, FileText, FilePen, Filter, BookOpen, Pencil, Trash2 } from "lucide-react";
import TabBar from "../../components/TabBar";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { EmptyState } from "../../components/EmptyState";
import { PolicyTemplatesProps } from "../../types/interfaces/i.policy";
import { SearchBox } from "../../components/Search";
import { PolicyTemplateCategory } from "../../../domain/enums/policy.enum";
import TagChip from "../../components/Tags/TagChip";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import CustomizableSkeleton from "../../components/Skeletons";
import CustomizablePolicyTable from "../../components/Table/PolicyTable";
import StandardModal from "../../components/Modals/StandardModal";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import singleTheme from "../../themes/v1SingleTheme";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { useHasPermission } from "../../../application/hooks/useMyPermissions";
import {
  useCreatePolicyTemplate,
  useDeletePolicyTemplate,
  usePolicyTemplates,
  useUpdatePolicyTemplate,
} from "../../../application/hooks/usePolicyTemplates";
import type {
  PolicyTemplate,
  PolicyTemplateOrigin,
} from "../../../domain/interfaces/i.policyTemplate";

// Define table headers in the format expected by CustomizablePolicyTable
const tableHeaders = [
  { id: "id", name: "ID" },
  { id: "title", name: "Title" },
  { id: "tags", name: "Tags" },
  { id: "description", name: "Description" },
];

type PolicyTemplateColumnKey = "title" | "id" | "tags" | "description" | "actions";

const POLICY_TEMPLATE_TABLE_COLUMNS: ColumnConfig<PolicyTemplateColumnKey>[] = [
  { key: "id", label: "ID", defaultVisible: true },
  { key: "title", label: "Title", defaultVisible: true, alwaysVisible: true },
  { key: "tags", label: "Tags", defaultVisible: true },
  { key: "description", label: "Description", defaultVisible: true },
  {
    key: "actions",
    label: "Actions",
    defaultVisible: true,
    alwaysVisible: true,
  } as ColumnConfig<"actions">, // Add actions column config
];

const CATEGORY_ITEMS = [...Object.values(PolicyTemplateCategory)].map((value) => ({
  _id: value,
  name: value,
}));

/** Row shape the table machinery works with: API row + origin + title alias. */
type TemplateRow = PolicyTemplate & { origin: PolicyTemplateOrigin; title: string };

const toRow = (template: PolicyTemplate): TemplateRow => ({
  ...template,
  origin: template.is_system_template ? "system" : "organization",
  title: template.name,
});

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Operation failed"
  );
}

const PolicyTemplates: React.FC<PolicyTemplatesProps> = ({
  tags: _tags,
  fetchAll: _fetchAll,
  isLoading: isLoadingProp = false,
}) => {
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const canCreatePolicy = !!userRoleName && allowedRoles.policies.create.includes(userRoleName);
  // The template routes authorize on this key, so a custom role granted it
  // can manage templates too (Admin and Editor by default).
  const canManageTemplates = useHasPermission("policyTemplate.edit", { fallbackToAdmin: true });
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Section toggle: system templates vs. the organization's own (#5261).
  const [section, setSection] = useState<PolicyTemplateOrigin>("system");
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "" });
  const [confirmDelete, setConfirmDelete] = useState<TemplateRow | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: templates = [], isLoading: isLoadingQuery } = usePolicyTemplates();
  const createMutation = useCreatePolicyTemplate();
  const updateMutation = useUpdatePolicyTemplate();
  const deleteMutation = useDeletePolicyTemplate();
  const isLoading = isLoadingProp || isLoadingQuery;

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Handle templateId URL param to redirect to editor from Wise Search. Ids
  // are composite `${origin}-${id}` because system and org template ids can
  // collide (#5261); a bare numeric id is a legacy link the editor still
  // resolves. Anything else is dropped rather than forwarded.
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (templateId && !hasProcessedUrlParam.current) {
      hasProcessedUrlParam.current = true;
      setSearchParams({}, { replace: true });
      if (/^((system|organization)-)?\d+$/.test(templateId)) {
        navigate(`/policies/new?templateId=${templateId}`);
      }
    }
  }, [searchParams, setSearchParams, navigate]);

  const handleSelectPolicyTemplate = (row: TemplateRow) => {
    if (row && canCreatePolicy) {
      navigate(`/policies/new?templateId=${row.origin}-${row.id}`);
    }
  };

  const openEdit = (row: TemplateRow) => {
    setEditing(row);
    setEditForm({
      name: row.name,
      description: row.description ?? "",
      category: row.category,
    });
    setServerError(null);
  };

  const handleDuplicate = async (row: TemplateRow) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync({
        name: `${row.name} (copy)`,
        category: row.category,
        description: row.description,
        content: row.content,
        tags: row.tags,
      });
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setServerError(null);
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        body: {
          name: editForm.name,
          description: editForm.description || null,
          category: editForm.category,
        },
      });
      setEditing(null);
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  // FilterBy - Filter columns configuration
  const policyTemplateFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text" as const,
      },
      {
        id: "category",
        label: "Category",
        type: "select" as const,
        options: [...Object.values(PolicyTemplateCategory)].map((value) => ({
          value: value,
          label: value,
        })),
      },
    ],
    [],
  );

  // FilterBy - Field value getter
  const getPolicyTemplateFieldValue = useCallback(
    (item: TemplateRow, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "title":
          return item.title;
        case "category":
          return item.category;
        default:
          return null;
      }
    },
    [],
  );

  // FilterBy - Initialize hook
  const {
    filterData: filterPolicyTemplateData,
    handleFilterChange: handlePolicyTemplateFilterChange,
  } = useFilterBy<TemplateRow>(getPolicyTemplateFieldValue);

  // Section + filter + search
  const filteredPolicyTemplates = useMemo(() => {
    const rows = templates.map(toRow).filter((row) => row.origin === section);
    let result = filterPolicyTemplateData(rows);

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(query));
    }

    return result;
  }, [filterPolicyTemplateData, templates, searchTerm, section]);

  // Define how to get the group key for each policy template
  const getTemplateGroupKey = useCallback((template: TemplateRow, field: string): string => {
    switch (field) {
      case "category":
        return template.category || "Unknown";
      default:
        return "Other";
    }
  }, []);

  // Apply grouping to filtered templates
  const groupedTemplates = useTableGrouping({
    data: filteredPolicyTemplates,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getTemplateGroupKey,
  });

  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } = useColumnVisibility({
    tableId: "policy-templates-table",
    columns: POLICY_TEMPLATE_TABLE_COLUMNS,
  });

  const isVisible = useCallback(
    (key: string) =>
      !visibleColumns ||
      visibleColumns.size === 0 ||
      visibleColumns.has(key as PolicyTemplateColumnKey),
    [visibleColumns],
  );

  const visibleTableHeaders = useMemo(
    () => tableHeaders.filter((col) => col.id === "title" || isVisible(col.id)),
    [isVisible],
  );

  return (
    <Stack>
      {/* System / Our templates switch (#5261) */}
      <TabContext value={section}>
        <Box sx={{ mb: "16px" }}>
          <TabBar
            tabs={[
              { label: "System templates", value: "system" },
              { label: "Our templates", value: "organization" },
            ]}
            activeTab={section}
            onChange={(_e, value) => setSection(value as PolicyTemplateOrigin)}
          />
        </Box>
      </TabContext>

      <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: "8px", mb: "16px" }}>
        {/* FilterBy */}
        <div data-joyride-id="policy-status-filter">
          <FilterBy
            columns={policyTemplateFilterColumns}
            onFilterChange={handlePolicyTemplateFilterChange}
          />
        </div>

        {/* Group By */}
        <GroupBy
          options={[{ id: "category", label: "Category" }]}
          onGroupChange={handleGroupChange}
        />

        {/* Column Selector */}
        <ColumnSelector
          columns={allColumns}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onResetToDefaults={resetToDefaults}
        />

        {/* Search */}
        <Box data-joyride-id="policy-search">
          <SearchBox
            placeholder="Search policy templates..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search policy templates" }}
            fullWidth={false}
          />
        </Box>
      </Stack>

      {serverError && (
        <Typography sx={{ fontSize: 12, color: "error.main", mb: "8px" }}>{serverError}</Typography>
      )}

      {/* Table */}
      {isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      ) : filteredPolicyTemplates.length === 0 ? (
        <EmptyState icon={FileText} message="No policy templates found.">
          <EmptyStateTip
            icon={Copy}
            title="What are policy templates?"
            description="Pre-built policy documents covering common AI governance topics. Copy a template, customize it for your organization, and publish."
          />
          <EmptyStateTip
            icon={Filter}
            title="Filter by framework"
            description="Templates are grouped by framework (EU AI Act, ISO 42001, etc.). Use the search bar to find templates relevant to your compliance needs."
          />
          <EmptyStateTip
            icon={BookOpen}
            title="Build your own"
            description={
              section === "organization"
                ? "Save any policy as a reusable template from the policies tab, or duplicate a system template into this section."
                : "If no template fits, create a policy from scratch in the policies tab. You can always come back here for reference."
            }
          />
        </EmptyState>
      ) : (
        <GroupedTableView
          groupedData={groupedTemplates}
          ungroupedData={filteredPolicyTemplates}
          renderTable={(data, options) => (
            <CustomizablePolicyTable
              data={{ rows: data, cols: visibleTableHeaders }}
              paginated
              setSelectedRow={() => {}}
              setAnchorEl={() => {}}
              onRowClick={(id: string) => {
                const row = data.find((r) => String(r.id) === String(id));
                if (row) handleSelectPolicyTemplate(row);
              }}
              hidePagination={options?.hidePagination}
              renderRow={(policy: TemplateRow, sortConfig) => (
                <TableRow
                  key={`${policy.origin}-${policy.id}`}
                  tabIndex={0}
                  aria-label={`Policy template: ${policy.title}`}
                  sx={{ ...singleTheme.tableStyles.primary.body.row }}
                  onClick={() => handleSelectPolicyTemplate(policy)}
                >
                  {isVisible("id") && (
                    <TableCell
                      sx={{
                        ...cellStyle,
                        fontWeight: 500,
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("id")
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      {policy.origin === "system" ? (
                        <Chip
                          label="System"
                          size="small"
                          sx={{ fontSize: "11px", height: "20px", borderRadius: "4px" }}
                        />
                      ) : (
                        policy.id
                      )}
                    </TableCell>
                  )}
                  <TableCell
                    sx={{
                      ...cellStyle,
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      backgroundColor: sortConfig?.key?.toLowerCase().includes("title")
                        ? "background.surface"
                        : "inherit",
                    }}
                  >
                    {policy.title}
                  </TableCell>
                  {isVisible("tags") && (
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("tags")
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      <Stack direction="row" flexWrap="wrap" sx={{ gap: "2px" }}>
                        {policy.tags.map((tag: string, index: number) => (
                          <TagChip key={`${tag}-${index}`} tag={tag} />
                        ))}
                      </Stack>
                    </TableCell>
                  )}
                  {isVisible("description") && (
                    <TableCell
                      sx={{
                        ...cellStyle,
                        maxWidth: 250,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("description")
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      {policy.description}
                    </TableCell>
                  )}
                  <TableCell sx={{ ...cellStyle }} align="right">
                    <Stack
                      direction="row"
                      justifyContent="flex-end"
                      sx={{ gap: "2px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {policy.origin === "system"
                        ? canManageTemplates && (
                            <Tooltip title="Duplicate into our templates">
                              <IconButton
                                size="small"
                                disableRipple
                                aria-label={`Duplicate ${policy.title}`}
                                onClick={() => handleDuplicate(policy)}
                                disabled={createMutation.isPending}
                              >
                                <Copy size={16} />
                              </IconButton>
                            </Tooltip>
                          )
                        : canManageTemplates && (
                            <>
                              <Tooltip title="Edit content">
                                <IconButton
                                  size="small"
                                  disableRipple
                                  aria-label={`Edit content of ${policy.title}`}
                                  onClick={() => navigate(`/policies/templates/${policy.id}/edit`)}
                                >
                                  <FilePen size={16} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit details">
                                <IconButton
                                  size="small"
                                  disableRipple
                                  aria-label={`Edit ${policy.title}`}
                                  onClick={() => openEdit(policy)}
                                >
                                  <Pencil size={16} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete template">
                                <IconButton
                                  size="small"
                                  disableRipple
                                  aria-label={`Delete ${policy.title}`}
                                  onClick={() => setConfirmDelete(policy)}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            />
          )}
        />
      )}

      {editing && (
        <StandardModal
          isOpen
          onClose={() => setEditing(null)}
          title="Edit template details"
          description="Update the name, description and category of this organization template. To change its content, use Edit content."
          onSubmit={handleSaveEdit}
          submitButtonText="Save"
          isSubmitting={updateMutation.isPending}
          maxWidth="560px"
        >
          <Stack sx={{ gap: "16px" }}>
            <Field
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              isRequired
            />
            <Field
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
            <Select
              id="template-category"
              label="Category"
              value={editForm.category}
              items={CATEGORY_ITEMS}
              onChange={(e) => setEditForm({ ...editForm, category: String(e.target.value) })}
            />
            {serverError && (
              <Typography sx={{ fontSize: 12, color: "error.main" }}>{serverError}</Typography>
            )}
          </Stack>
        </StandardModal>
      )}

      {confirmDelete && (
        <ConfirmationModal
          isOpen
          title="Delete this template?"
          body={`When you delete "${confirmDelete.title}", it is removed from your organization's template library. Policies already created from it are not affected.`}
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={() => setConfirmDelete(null)}
          onProceed={async () => {
            try {
              await deleteMutation.mutateAsync(confirmDelete.id);
              setConfirmDelete(null);
            } catch (err) {
              setServerError(extractErrorMessage(err));
              setConfirmDelete(null);
            }
          }}
          isLoading={deleteMutation.isPending}
        />
      )}
    </Stack>
  );
};

export default PolicyTemplates;
