/**
 * @fileoverview My datasets tab: toolbar (filter/group/search/actions) and grouped datasets table.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/MyDatasetsTab
 */

import { Box, Stack } from "@mui/material";
import { Plus, Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import SearchBox from "../../../components/Search/SearchBox";
import {
  FilterBy,
  type FilterColumn,
  type FilterCondition,
} from "../../../components/Table/FilterBy";
import { GroupBy } from "../../../components/Table/GroupBy";
import { GroupedTableView } from "../../../components/Table/GroupedTableView";
import DatasetsTable, { type DatasetRow } from "../../../components/Table/DatasetsTable";
import { palette } from "../../../themes/palette";
import type { GroupedData } from "../../../../application/hooks/useTableGrouping";
import type { BuiltInDataset } from "./types";

export type MyDatasetsTabProps = {
  filterColumns: FilterColumn[];
  onFilterChange: (conditions: FilterCondition[], logic: "and" | "or") => void;
  onGroupChange: (field: string | null, sortOrder: "asc" | "desc") => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  uploading: boolean;
  canUploadDataset: boolean;
  canDeleteDataset: boolean;
  onUploadClick: () => void;
  onCreateClick: () => void;
  groupedDatasets: GroupedData<BuiltInDataset>[] | null;
  filteredDatasets: BuiltInDataset[];
  loading: boolean;
  onRowClick: (dataset: BuiltInDataset) => void;
  onView: (dataset: BuiltInDataset) => void;
  onEdit: (dataset: BuiltInDataset) => void;
  onDelete: (dataset: BuiltInDataset) => void;
  onDownload: (dataset: BuiltInDataset) => void;
};

export default function MyDatasetsTab({
  filterColumns,
  onFilterChange,
  onGroupChange,
  searchTerm,
  onSearchTermChange,
  uploading,
  canUploadDataset,
  canDeleteDataset,
  onUploadClick,
  onCreateClick,
  groupedDatasets,
  filteredDatasets,
  loading,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  onDownload,
}: MyDatasetsTabProps) {
  return (
    <>
      {/* Filters + search + upload + create */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        sx={{ marginBottom: "18px" }}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <FilterBy columns={filterColumns} onFilterChange={onFilterChange} />
          <GroupBy
            options={[
              { id: "name", label: "Name" },
              { id: "prompts", label: "Prompts" },
              { id: "createdAt", label: "Created" },
            ]}
            onGroupChange={onGroupChange}
          />
          <SearchBox
            placeholder="Search datasets..."
            value={searchTerm}
            onChange={onSearchTermChange}
            inputProps={{ "aria-label": "Search datasets" }}
            fullWidth={false}
          />
        </Stack>
        <Stack direction="row" spacing={2}>
          <CustomizableButton
            variant="outlined"
            text={uploading ? "Uploading..." : "Upload dataset"}
            icon={<Upload size={16} />}
            onClick={onUploadClick}
            isDisabled={uploading || !canUploadDataset}
            sx={{
              border: `1px solid ${palette.border.dark}`,
              color: palette.text.secondary,
              gap: 2,
            }}
          />
          <CustomizableButton
            variant="contained"
            text="Add dataset"
            icon={<Plus size={16} />}
            onClick={onCreateClick}
            isDisabled={!canUploadDataset}
            sx={{
              backgroundColor: palette.brand.primary,
              border: `1px solid ${palette.brand.primary}`,
              gap: 2,
            }}
          />
        </Stack>
      </Stack>

      {/* Table of user datasets */}
      <Box mb={4}>
        <GroupedTableView
          groupedData={groupedDatasets}
          ungroupedData={filteredDatasets}
          renderTable={(data, options) => (
            <DatasetsTable
              rows={data.map((dataset): DatasetRow => ({
                key: dataset.path,
                name: dataset.name,
                path: dataset.path,
                type: dataset.turnType,
                useCase: dataset.use_case || dataset.datasetType,
                createdAt: dataset.createdAt,
                metadata: {
                  promptCount: dataset.promptCount ?? 0,
                  avgDifficulty: "Medium", // Default - only shown for user datasets
                  loading: false,
                },
              }))}
              onRowClick={
                canUploadDataset
                  ? (row) => {
                      const dataset = data.find((d) => d.path === row.path);
                      if (dataset) onRowClick(dataset);
                    }
                  : undefined
              }
              onView={(row) => {
                const dataset = data.find((d) => d.path === row.path);
                if (dataset) onView(dataset);
              }}
              onEdit={
                canUploadDataset
                  ? (row) => {
                      const dataset = data.find((d) => d.path === row.path);
                      if (dataset) onEdit(dataset);
                    }
                  : undefined
              }
              onDelete={
                canDeleteDataset
                  ? (row) => {
                      const dataset = data.find((d) => d.path === row.path);
                      if (dataset) onDelete(dataset);
                    }
                  : undefined
              }
              onDownload={(row: DatasetRow) => {
                const dataset = data.find((d) => d.path === row.path);
                if (dataset) onDownload(dataset);
              }}
              loading={loading}
              hidePagination={options?.hidePagination}
            />
          )}
        />
      </Box>
    </>
  );
}
