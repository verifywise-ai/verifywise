import {
  TableBody,
  TableCell,
  TableFooter,
  TablePagination,
  TableRow,
  useTheme,
} from "@mui/material";
import { useCallback, useState } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { ChevronsUpDown } from "lucide-react";
import Checkbox from "../../Inputs/Checkbox";

interface SelectorVerticalProps {
  [key: string]: unknown;
}

const SelectorVertical = (props: SelectorVerticalProps) => (
  <ChevronsUpDown size={16} {...props} />
);
import {
  paginationStyle,
  paginationDropdown,
  paginationSelect,
} from "../styles";
import TablePaginationActions from "../../TablePagination";
import Chip from "../../Chip";
import { useSearchParams } from "react-router-dom";
import { CustomizableButton } from "../../button/customizable-button";
import {
  IAuditRiskTableBodyProps,
  ITypeRisk,
} from "../../../types/interfaces/i.table";

const navigateToNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export const AuditRiskTableBody: React.FC<IAuditRiskTableBodyProps> = ({
  rows,
  page,
  setCurrentPagingation,
  deletedRisks,
  checkedRows,
  setCheckedRows,
}) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const theme = useTheme();
  const [searchParams] = useSearchParams();

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

  const handleChange = (
    riskData: ITypeRisk,
    event: React.ChangeEvent | React.MouseEvent
  ) => {
    event.stopPropagation();
    const riskId = riskData.id;
    if (deletedRisks.includes(riskId)) {
      // Risk is deleted, skip selection
      return;
    } else if (checkedRows.includes(riskId)) {
      setCheckedRows(checkedRows.filter((id) => id !== riskId));
    } else {
      setCheckedRows([...checkedRows, riskId]);
    }
  };

  const handleRowClick = (riskData: ITypeRisk, event: React.MouseEvent) => {
    event.stopPropagation();
    const riskId = riskData.id;
    if (riskId) {
      navigateToNewTab(
        `/project-view?projectId=${searchParams.get(
          "projectId"
        )}&tab=project-risks&riskId=${riskId}`
      );
    }
  };

  return (
    <>
      <TableBody>
        {rows &&
          rows
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((row: ITypeRisk, index: number) => (
              <TableRow
                key={index}
                sx={singleTheme.tableStyles.primary.body.row}
              >
                <TableCell sx={cellStyle}>
                  <Checkbox
                    size="small"
                    id={`audit-risk-${row.id}`}
                    isChecked={
                      deletedRisks.includes(row.id) ||
                      checkedRows.includes(row.id)
                    }
                    value={row.id.toString()}
                    onChange={(e) => handleChange(row, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell sx={cellStyle}>
                  {row.id ? row.id : page * rowsPerPage + index + 1}
                </TableCell>
                <TableCell>
                  {row.title
                    ? row.title.length > 30
                      ? `${row.title.slice(0, 30)}...`
                      : row.title
                    : "-"}
                </TableCell>
                <TableCell sx={{ maxWidth: "300px" }}>
                  {row.status ? row.status : "-"}
                </TableCell>
                <TableCell sx={cellStyle}>
                  {row.severity ? <Chip label={row.severity} /> : "-"}
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
