import React, { useCallback, useState } from "react";
import {
  TableBody,
  TableCell,
  TableRow,
  useTheme,
  TableFooter,
  TablePagination,
} from "@mui/material";
import { ChevronsUpDown } from "lucide-react";
import Checkbox from "../../../Inputs/Checkbox";

import singleTheme from "../../../../themes/v1SingleTheme";
import Chip from "../../../Chip";
import { paginationStyle, paginationDropdown, paginationSelect } from "../../styles";
import TablePaginationActions from "../../../TablePagination";
import { IProjectRiskTableBodyProps } from "../../../../types/interfaces/i.table";
import { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;
const LinkedRisksTableBody: React.FC<IProjectRiskTableBodyProps> = ({
  rows,
  page,
  setCurrentPagingation,
  currentRisks,
  checkedRows,
  setCheckedRows,
  deletedRisks,
  setDeletedRisks,
}) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const theme = useTheme();

  const handleChangePage = useCallback(
    (_: unknown, newPage: number) => {
      setCurrentPagingation(newPage);
    },
    [setCurrentPagingation],
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setCurrentPagingation(0);
    },
    [setRowsPerPage, setCurrentPagingation],
  );

  const handleRowClick = (riskData: RiskModel, event: React.ChangeEvent | React.MouseEvent) => {
    event.stopPropagation();
    const riskId = riskData.id;

    if (!riskId) return;

    if (checkedRows.includes(riskId)) {
      setCheckedRows(checkedRows.filter((id) => id !== riskId));
      if (currentRisks.includes(riskId)) {
        setDeletedRisks([...deletedRisks, riskId]);
      }
    } else {
      setCheckedRows([...checkedRows, riskId]);
      if (deletedRisks.includes(riskId)) {
        setDeletedRisks(deletedRisks.filter((id) => id !== riskId));
      }
    }
  };

  return (
    <>
      <TableBody>
        {rows &&
          rows
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((row: RiskModel, index: number) => (
              <TableRow
                key={index}
                sx={singleTheme.tableStyles.primary.body.row}
                onClick={(e) => handleRowClick(row, e)}
              >
                <TableCell sx={cellStyle}>
                  <Checkbox
                    size="small"
                    id={`linked-risk-${row.id}`}
                    isChecked={checkedRows.includes(row.id!)}
                    value={row.id ? row.id.toString() : ""}
                    onChange={(e) => handleRowClick(row, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell sx={cellStyle}>
                  {row.id ? row.id : page * rowsPerPage + index + 1}
                </TableCell>
                <TableCell>{row.risk_name ? row.risk_name : "-"}</TableCell>
                <TableCell sx={{ maxWidth: "300px" }}>
                  {row.risk_description ? row.risk_description : "-"}
                </TableCell>
                <TableCell sx={cellStyle}>
                  {row.risk_severity ? <Chip label={row.risk_severity} /> : "-"}
                </TableCell>
                <TableCell sx={cellStyle}>{row.likelihood ? row.likelihood : "-"}</TableCell>
                <TableCell sx={cellStyle}>{row.risk_category ? row.risk_category : "-"}</TableCell>
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
              `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
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

export default LinkedRisksTableBody;
