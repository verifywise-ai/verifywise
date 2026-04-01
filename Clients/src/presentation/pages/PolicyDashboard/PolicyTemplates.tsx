import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Box, Stack, TableRow, TableCell } from "@mui/material";
import { FileText, Copy, Filter, BookOpen } from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { EmptyState } from "../../components/EmptyState";
import policyTemplates from "../../../application/data/PolicyTemplates.json";
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
import CustomizablePolicyTable from "../../components/Table/PolicyTable";
import singleTheme from "../../themes/v1SingleTheme";

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
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true } as ColumnConfig<"actions">, // Add actions column config
];

const PolicyTemplates: React.FC<PolicyTemplatesProps> = ({
  tags: _tags,
  fetchAll: _fetchAll,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Handle templateId URL param to redirect to editor from Wise Search
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (templateId && !hasProcessedUrlParam.current) {
      hasProcessedUrlParam.current = true;
      setSearchParams({}, { replace: true });
      navigate(`/policies/new?templateId=${templateId}`);
    }
  }, [searchParams, setSearchParams, navigate]);

  const handleSelectPolicyTemplate = (id: number) => {
    if (id) {
      navigate(`/policies/new?templateId=${id}`);
    }
  };

  // Define the type for policy template items
  type PolicyTemplateItem = typeof policyTemplates[number];

  // FilterBy - Filter columns configuration
  const policyTemplateFilterColumns: FilterColumn[] = useMemo(() => [
    {
      id: 'title',
      label: 'Title',
      type: 'text' as const,
    },
    {
      id: 'category',
      label: 'Category',
      type: 'select' as const,
      options: [...Object.values(PolicyTemplateCategory)].map((value) => ({
        value: value,
        label: value,
      })),
    },
  ], []);

  // FilterBy - Field value getter
  const getPolicyTemplateFieldValue = useCallback(
    (item: PolicyTemplateItem, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case 'title':
          return item.title;
        case 'category':
          return item.category;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook
  const { filterData: filterPolicyTemplateData, handleFilterChange: handlePolicyTemplateFilterChange } = useFilterBy<PolicyTemplateItem>(getPolicyTemplateFieldValue);

  // Filter + search using FilterBy
  const filteredPolicyTemplates = useMemo(() => {
    let result = filterPolicyTemplateData(policyTemplates);

    // Apply search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(query)
      );
    }

    return result;
  }, [filterPolicyTemplateData, searchTerm]);

  // Define how to get the group key for each policy template
  const getTemplateGroupKey = useCallback((template: PolicyTemplateItem, field: string): string => {
    switch (field) {
      case 'category':
        return template.category || 'Unknown';
      default:
        return 'Other';
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

  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } =
    useColumnVisibility({ tableId: "policy-templates-table", columns: POLICY_TEMPLATE_TABLE_COLUMNS });

  const isVisible = useCallback(
    (key: string) => !visibleColumns || visibleColumns.size === 0 || visibleColumns.has(key as PolicyTemplateColumnKey),
    [visibleColumns]
  );

  const visibleTableHeaders = useMemo(
    () => tableHeaders.filter((col) => col.id === "title" || isVisible(col.id)),
    [isVisible]
  );

  return (
    <Stack>
      <Stack direction="row" spacing={2} alignItems="center" mb={8}>
        {/* FilterBy */}
        <div data-joyride-id="policy-status-filter">
          <FilterBy
            columns={policyTemplateFilterColumns}
            onFilterChange={handlePolicyTemplateFilterChange}
          />
        </div>

        {/* Group By */}
        <GroupBy
          options={[
            { id: 'category', label: 'Category' },
          ]}
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

      {/* Table */}
      {filteredPolicyTemplates.length === 0 ? (
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
            description="If no template fits, create a policy from scratch in the policies tab. You can always come back here for reference."
          />
        </EmptyState>
      ) : (
        <GroupedTableView
          groupedData={groupedTemplates}
          ungroupedData={filteredPolicyTemplates}
          renderTable={(data, options) => (
            <CustomizablePolicyTable
              data={{ rows: data.map(p => ({ ...p, id: p.id })), cols: visibleTableHeaders }}
              paginated
              setSelectedRow={() => { }}
              setAnchorEl={() => { }}
              onRowClick={(id: string) => handleSelectPolicyTemplate(Number(id))}
              hidePagination={options?.hidePagination}
              renderRow={(policy, sortConfig) => (
                <TableRow
                  key={policy.id}
                  tabIndex={0}
                  aria-label={`Policy template: ${policy.title}`}
                  sx={{ ...singleTheme.tableStyles.primary.body.row }}
                  onClick={() => handleSelectPolicyTemplate(policy.id)}
                >
                  {isVisible("id") && (
                    <TableCell
                      sx={{
                        ...cellStyle,
                        fontWeight: 500,
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("id") ? "background.surface" : "inherit",
                      }}
                    >
                      {policy.id}
                    </TableCell>
                  )}
                  <TableCell
                    sx={{
                      ...cellStyle,
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      backgroundColor: sortConfig?.key?.toLowerCase().includes("title") ? "background.surface" : "inherit",
                    }}
                  >
                    {policy.title}
                  </TableCell>
                  {isVisible("tags") && (
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("tags") ? "background.surface" : "inherit",
                      }}
                    >
                      <Stack direction="row" gap={1} flexWrap="wrap">
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
                        backgroundColor: sortConfig?.key?.toLowerCase().includes("description") ? "background.surface" : "inherit",
                      }}
                    >
                      {policy.description}
                    </TableCell>
                  )}
                </TableRow>
              )}
            />
          )}
        />
      )}

    </Stack>
  );
};

export default PolicyTemplates;
