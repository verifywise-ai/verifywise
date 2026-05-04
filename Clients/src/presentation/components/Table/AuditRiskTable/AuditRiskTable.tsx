import { Table, TableContainer } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import { tableWrapper } from "../styles";
import TableHeader from "../TableHead";
import { AuditRiskTableBody } from "./AuditRiskTableBody";
import { useEffect, useState } from "react";
import { getProjectRiskById } from "../../../../application/repository/projectRisk.repository";
import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { IAuditRiskTableProps, ITypeRisk } from "../../../types/interfaces/i.table";

const TITLE_OF_COLUMNS = ["Unlink", "ID", "Risk Title", "Status", "Severity", ""];

export const AuditRiskTable: React.FC<IAuditRiskTableProps> = ({
  risks,
  deletedRisks,
  checkedRows,
  setCheckedRows,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const setCurrentPagingation = (page: number) => {
    setCurrentPage(page);
  };
  const [riskDetails, setRiskDetails] = useState<ITypeRisk[]>([]);

  useEffect(() => {
    const fetchRiskDetails = async () => {
      await Promise.all(
        risks.map(async (riskId) => {
          try {
            const responseData = await getProjectRiskById({ id: riskId });
            if (responseData?.data) {
              const riskData = responseData.data as RiskModel;
              setRiskDetails((prev) => [
                ...prev,
                {
                  id: riskData.id ?? 0,
                  title: riskData.risk_name,
                  status: riskData.approval_status,
                  severity: riskData.severity,
                },
              ]);
            }
          } catch (error) {
            console.error(`Failed to fetch risk ${riskId}:`, error);
          }
        }),
      );
    };
    fetchRiskDetails();
  }, [risks]);

  return (
    <TableContainer>
      <Table
        sx={{
          ...singleTheme.tableStyles.primary.frame,
          ...tableWrapper,
        }}
      >
        <TableHeader columns={TITLE_OF_COLUMNS} />
        <AuditRiskTableBody
          rows={riskDetails}
          page={currentPage}
          setCurrentPagingation={setCurrentPagingation}
          deletedRisks={deletedRisks}
          checkedRows={checkedRows}
          setCheckedRows={setCheckedRows}
        />
      </Table>
    </TableContainer>
  );
};
