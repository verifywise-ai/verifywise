import {
  TableBody,
  TableCell,
  TableFooter,
  TablePagination,
  TableRow,
  useTheme,
} from "@mui/material";
import { ProjectRiskMitigation } from "../../../../domain/types/ProjectRisk";
import singleTheme from "../../../themes/v1SingleTheme";
import { useCallback, useState } from "react";
import TablePaginationActions from "../../TablePagination";
import { ChevronsUpDown } from "lucide-react";

interface SelectorVerticalProps {
  [key: string]: unknown;
}

const SelectorVertical = (props: SelectorVerticalProps) => (
  <ChevronsUpDown size={16} {...props} />
);
import {
  paginationDropdown,
  paginationSelect,
  paginationStyle,
} from "../styles";
import { CustomizableButton } from "../../button/customizable-button";

interface ProjectRiskMitigationTableBodyProps {
  rows: ProjectRiskMitigation[];
  page: number;
  setCurrentPagingation: (pageNo: number) => void;
}

const navigateToNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export const ProjectRiskMitigationTableBody: React.FC<
  ProjectRiskMitigationTableBodyProps
> = ({ rows, page, setCurrentPagingation }) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const theme = useTheme();

  const handleChangePage = useCallback(
    (_: unknown, newPage: number) => {
      setCurrentPagingation(newPage);
    },
    [setCurrentPagingation]
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setCurrentPagingation(0);
    },
    [setRowsPerPage, setCurrentPagingation]
  );

  const handleRowClick = (
    riskData: ProjectRiskMitigation,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    const riskId = riskData.id;
    if (riskId) {
      if (riskData.type === "annexcategory") {
        navigateToNewTab(
          `/framework?framework=iso-42001&annexId=${riskData.parent_id}&annexCategoryId=${riskData.meta_id}`
        );
      } else if (riskData.type === "subclause") {
        navigateToNewTab(
          `/framework?framework=iso-42001&clauseId=${riskData.parent_id}&subClauseId=${riskData.meta_id}`
        );
      } else if (riskData.type === "control") {
        navigateToNewTab(
          `/project-view?projectId=${riskData.project_id}&tab=frameworks&framework=eu-ai-act&controlId=${riskData.meta_id}`
        );
      } else if (riskData.type === "assessment") {
        navigateToNewTab(
          `/project-view?projectId=${riskData.project_id}&tab=frameworks&framework=eu-ai-act&topicId=${riskData.sup_id}&questionId=${riskData.meta_id}`
        );
      } else if (riskData.type === "annexcontrol_27001") {
        navigateToNewTab(
          `/framework?framework=iso-27001&annex27001Id=${riskData.parent_id}&annexControl27001Id=${riskData.meta_id}`
        );
      } else if (riskData.type === "annexsubclause_27001") {
        navigateToNewTab(
          `/framework?framework=iso-27001&clause27001Id=${riskData.parent_id}&subClause27001Id=${riskData.meta_id}`
        );
      }
    }
  };

  return (
    <>
      <TableBody>
        {rows &&
          rows
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((row: ProjectRiskMitigation, index: number) => (
              <TableRow
                key={index}
                sx={singleTheme.tableStyles.primary.body.row}
              >
                <TableCell sx={cellStyle}>
                  {(() => {
                    const title = `${
                      row.type === "annexcategory"
                        ? `A.${row.sup_id}.${row.sub_id} `
                        : row.type === "assessment"
                        ? ""
                        : `${row.sup_id}.${row.sub_id} `
                    }${row.title}`;
                    return title.length > 50
                      ? `${title.slice(0, 50)}...`
                      : title;
                  })()}
                </TableCell>
                <TableCell sx={cellStyle}>
                  {row.type === "annexcategory"
                    ? "ISO42001: Annex Category"
                    : row.type === "subclause"
                    ? "ISO42001: Sub-Clause"
                    : row.type === "assessment"
                    ? "EU-AI-Act: Assessment"
                    : row.type === "annexcontrol_27001"
                    ? "ISO27001: Annex Control"
                    : row.type === "annexsubclause_27001"
                    ? "ISO27001: Sub-Clause"
                    : "EU-AI-Act: Control"}
                </TableCell>
                <TableCell>
                  <CustomizableButton
                    sx={{
                      backgroundColor: "brand.primary",
                      color: "background.main",
                      border: "1px solid brand.primary",
                    }}
                    variant="contained"
                    text="View"
                    onClick={(e) => {
                      handleRowClick(row, e as React.MouseEvent<HTMLElement>);
                    }}
                  />
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
          <TablePagination
            count={rows?.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[5, 10, 15, 20, 25]}
            onRowsPerPageChange={handleChangeRowsPerPage}
            ActionsComponent={(props) => <TablePaginationActions {...props} />}
            labelRowsPerPage="Risks per page"
            labelDisplayedRows={({ page, count }) =>
              `Page ${page + 1} of ${Math.max(
                0,
                Math.ceil(count / rowsPerPage)
              )}`
            }
            sx={paginationStyle}
            slotProps={{
              select: {
                MenuProps: {
                  keepMounted: true,
                  PaperProps: {
                    className: "pagination-dropdown",
                    sx: paginationDropdown,
                  },
                  transformOrigin: { vertical: "bottom", horizontal: "left" },
                  anchorOrigin: { vertical: "top", horizontal: "left" },
                  sx: { mt: theme.spacing(-2) },
                },
                inputProps: { id: "pagination-dropdown" },
                IconComponent: SelectorVertical,
                sx: paginationSelect,
              },
            }}
          />
        </TableRow>
      </TableFooter>
    </>
  );
};
