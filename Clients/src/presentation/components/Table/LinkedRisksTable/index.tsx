import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@mui/material";
import React, { useState } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import TableHeader from "../TableHead";
import { TITLE_OF_COLUMNS } from "../../LinkedRisks/constants";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "../../EmptyState";

import LinkedRisksTableBody from "./TableBody";

import { tableWrapper } from "../styles";
import { ILinkedRisksTableProps } from "../../../types/interfaces/i.table";

const LinkedRisksTable: React.FC<ILinkedRisksTableProps> = ({
  projectRisksGroup,
  filteredRisksGroup,
  currentRisks,
  checkedRows,
  setCheckedRows,
  deletedRisks,
  setDeletedRisks,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const setCurrentPagingation = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <TableContainer>
      <Table
        sx={{
          ...singleTheme.tableStyles.primary.frame,
          ...tableWrapper,
        }}
      >
        <TableHeader columns={TITLE_OF_COLUMNS} />
        {projectRisksGroup.length > 0 ? (
          <>
            {filteredRisksGroup.length > 0 ? (
              <LinkedRisksTableBody
                rows={filteredRisksGroup}
                setCurrentPagingation={setCurrentPagingation}
                page={currentPage}
                currentRisks={currentRisks}
                checkedRows={checkedRows}
                setCheckedRows={setCheckedRows}
                deletedRisks={deletedRisks}
                setDeletedRisks={setDeletedRisks}
              />
            ) : (
              <>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={TITLE_OF_COLUMNS.length}
                      align="center"
                      sx={{ border: "none", p: 0 }}
                    >
                      <EmptyState icon={ShieldAlert} message="There is currently no data in this table." />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </>
            )}
          </>
        ) : (
          <>
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={TITLE_OF_COLUMNS.length}
                  align="center"
                  sx={{ border: "none", p: 0 }}
                >
                  <EmptyState message="There is currently no data in this table." />
                </TableCell>
              </TableRow>
            </TableBody>
          </>
        )}
      </Table>
    </TableContainer>
  );
};

export default LinkedRisksTable;
