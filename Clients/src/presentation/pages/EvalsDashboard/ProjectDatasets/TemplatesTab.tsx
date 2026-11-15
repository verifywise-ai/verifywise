/**
 * @fileoverview Templates tab: toolbar (filter/search) and built-in templates table.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/TemplatesTab
 */

import { Box, Stack } from "@mui/material";
import SearchBox from "../../../components/Search/SearchBox";
import { type FilterColumn, type FilterCondition } from "../../../components/Table/FilterBy";
import { TableFilter } from "../../../components/Table/TableFilter";
import TemplatesTable from "../../../components/Table/TemplatesTable";
import type { BuiltInDataset, TemplateWithCategory } from "./types";
import type { FilterFieldValue } from "../../../../application/utils/filterConditions";

export type TemplatesTabProps = {
  filterColumns: FilterColumn[];
  onFilterChange: (conditions: FilterCondition[], logic: "and" | "or") => void;
  /** The page's current conditions, so the filter shows them again after a tab switch. */
  filterConditions: FilterCondition[];
  /** The page's current and/or logic, so the classic filter restores it too. */
  filterLogic: "and" | "or";
  /** Templates before filtering, so the filter chips can count values. */
  filterRows: TemplateWithCategory[];
  getFilterFieldValue: (item: TemplateWithCategory, fieldId: string) => FilterFieldValue;
  templateSearchTerm: string;
  onTemplateSearchTermChange: (value: string) => void;
  filteredTemplates: TemplateWithCategory[];
  flattenedTemplatesCount: number;
  loading: boolean;
  copyingTemplate: boolean;
  templateGroups: Record<"chatbot" | "rag" | "agent", BuiltInDataset[]>;
  onViewTemplate: (template: BuiltInDataset) => void;
  onCopyTemplate: (template: BuiltInDataset) => void;
};

export default function TemplatesTab({
  filterColumns,
  onFilterChange,
  filterConditions,
  filterLogic,
  filterRows,
  getFilterFieldValue,
  templateSearchTerm,
  onTemplateSearchTermChange,
  filteredTemplates,
  flattenedTemplatesCount,
  loading,
  copyingTemplate,
  templateGroups,
  onViewTemplate,
  onCopyTemplate,
}: TemplatesTabProps) {
  return (
    <Box>
      {/* Filter + search toolbar */}
      <Stack direction="row" alignItems="center" gap={2} sx={{ marginBottom: "18px" }}>
        <TableFilter
          columns={filterColumns}
          defaultConditions={filterConditions}
          defaultLogic={filterLogic}
          onFilterChange={onFilterChange}
          data={filterRows}
          getFieldValue={getFilterFieldValue}
        />
        <SearchBox
          placeholder="Search templates..."
          value={templateSearchTerm}
          onChange={onTemplateSearchTermChange}
          inputProps={{ "aria-label": "Search templates" }}
          fullWidth={false}
        />
      </Stack>

      <TemplatesTable
        rows={filteredTemplates.map((ds) => ({
          key: ds.key,
          name: ds.name,
          path: ds.path,
          type: ds.type as "single-turn" | "multi-turn" | "simulated" | undefined,
          category: ds.category,
          test_count: ds.test_count,
          difficulty: ds.difficulty,
          description: ds.description,
        }))}
        loading={loading}
        onRowClick={(template) =>
          onViewTemplate(
            templateGroups[template.category]?.find((t) => t.key === template.key) ||
              (template as unknown as BuiltInDataset),
          )
        }
        onUse={(template) =>
          onCopyTemplate(
            templateGroups[template.category]?.find((t) => t.key === template.key) ||
              (template as unknown as BuiltInDataset),
          )
        }
        copyingTemplate={copyingTemplate}
        emptyMessage={
          flattenedTemplatesCount === 0
            ? "No template datasets available"
            : "No templates match your search"
        }
      />
    </Box>
  );
}
