/**
 * This file is currently in use
 */

import { Stack, Typography, Box } from "@mui/material";
import { RiskData } from "./riskkViewValues";
import { FC, useState, useMemo, useCallback, memo, useEffect } from "react";
import BasicTable from "../../../components/Table";
import { ProjectRisk } from "../../../../application/hooks/useProjectRisks";

import { getAllEntities } from "../../../../application/repository/entity.repository";
import { VendorRisk } from "../../../../domain/types/VendorRisk";
import { StatusTileCards, StatusTileItem } from "../../../components/Cards/StatusTileCards";

const projectRisksColNames = [
  {
    id: "risk_name",
    name: "RISK NAME",
  },
  {
    id: "impact",
    name: "IMPACT",
  },
  {
    id: "risk_owner",
    name: "OWNER",
  },
  {
    id: "severity",
    name: "SEVERITY",
  },
  {
    id: "likelihood",
    name: "LIKELIHOOD",
  },
  {
    id: "risk_level_autocalculated",
    name: "RISK LEVEL",
  },
  {
    id: "mitigation_status",
    name: "MITIGATION",
  },
  {
    id: "final_risk_level",
    name: "FINAL RISK LEVEL",
  },
  {
    id: "ale_estimate",
    name: "ALE ($)",
  },
];
interface RisksViewProps {
  risksSummary: RiskData;
  risksData: ProjectRisk[] | VendorRisk[];
  title: string;
  projectId: string;
}

const vendorRisksColNames = [
  { id: "vendor_name", name: "VENDOR NAME" },
  { id: "risk_name", name: "RISK NAME" },
  { id: "owner", name: "OWNER" },
  // { id: "risk_level", name: "RISK LEVEL" },
  { id: "review_date", name: "REVIEW DATE" },
];

/**
 * Read-only component for displaying project or vendor risks view.
 * Risk CRUD operations are available in the centralized Risk Management page.
 * @param risksSummary Summary data for risks visualization
 * @param risksData Array of project or vendor risks
 * @param title Type of risks being displayed ("Project" or "Vendor")
 */

const RisksView: FC<RisksViewProps> = memo(({ risksSummary, risksData, title, projectId }) => {
  /**
   * Determines which column set to use based on risk type
   */
  const risksTableCols = useMemo(() => {
    if (title === "Project") {
      return projectRisksColNames;
    } else {
      return vendorRisksColNames;
    }
  }, [title, vendorRisksColNames]);

  /**
   * Transforms risk data into table row format
   * Handles special formatting for dates and ensures data matches column structure
   */
  const risksTableRows = useMemo(() => {
    return risksData.reduce((acc: any[], item, i) => {
      const row: any = {
        id:
          (item as any).id ||
          (item as any).risk_id ||
          `${(item as ProjectRisk | VendorRisk).risk_description}_${i}`,
      };

      // Map all column values to the row
      risksTableCols.forEach((col) => {
        let value = (item as any)[col.id];

        // Special formatting for dates
        if (col.id === "review_date" && value) {
          value = new Date(value).toLocaleDateString();
        }

        // Special formatting for ALE currency
        if (col.id === "ale_estimate" && value != null) {
          value = `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        } else if (col.id === "ale_estimate") {
          value = "-";
        }

        // Set the value on the row object
        row[col.id] = value;
      });

      acc.push(row);
      return acc;
    }, []);
  }, [risksData, risksTableCols]);

  /**
   * Combines columns and rows data for table component
   */
  const tableData = useMemo(
    () => ({
      cols: risksTableCols,
      rows: risksTableRows,
    }),
    [risksTableCols, risksTableRows],
  );

  const [, setRiskData] = useState<ProjectRisk[] | VendorRisk[]>([]);

  const fetchRiskData = useCallback(async () => {
    try {
      const url =
        title === "Project"
          ? `/projectRisks/by-projid/${projectId}`
          : `/vendorRisks/by-projid/${projectId}`;
      const response = await getAllEntities({ routeUrl: url });
      setRiskData(response.data);
    } catch (error) {
      console.error("Error fetching vendor risks:", error);
    }
  }, []);

  useEffect(() => {
    fetchRiskData();
  }, [title]);

  const guidanceLink = title === "Project" ? "/risk-management" : "/vendors";
  const guidancePage = title === "Project" ? "Risk Management" : "Vendors";

  return (
    <Stack>
      <StatusTileCards
        items={
          [
            { key: "Total", label: "Total", count: risksSummary.total, color: "#4B5563" },
            {
              key: "Very high",
              label: "Very high",
              count: risksSummary.veryHighRisks,
              color: "#C63622",
            },
            { key: "High", label: "High", count: risksSummary.highRisks, color: "#D68B61" },
            { key: "Medium", label: "Medium", count: risksSummary.mediumRisks, color: "#D6B971" },
            { key: "Low", label: "Low", count: risksSummary.lowRisks, color: "#52AB43" },
            {
              key: "Very low",
              label: "Very low",
              count: risksSummary.veryLowRisks,
              color: "#B8D39C",
            },
          ] satisfies StatusTileItem[]
        }
        entityName="risk"
        size="small"
      />
      <Stack
        sx={{ mt: "32px", mb: "28px" }}
        direction="row"
        justifyContent="space-between"
        alignItems="flex-end"
      >
        <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600, color: "text.primary" }}>
          {title} risks
        </Typography>
      </Stack>

      <Box
        sx={{
          mb: 2,
          p: 1.5,
          borderRadius: 1,
          backgroundColor: "action.hover",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          This is a read-only view. To add or edit {title.toLowerCase()} risks, go to the{" "}
          <Typography
            component="a"
            href={guidanceLink}
            variant="body2"
            sx={{
              "color": "primary.main",
              "textDecoration": "none",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {guidancePage}
          </Typography>{" "}
          page.
        </Typography>
      </Box>

      {/* map the data */}
      <BasicTable
        data={tableData}
        bodyData={risksTableRows}
        table="risksTable"
        paginated
        label={`${title} risk`}
      />
    </Stack>
  );
});

export default RisksView;
