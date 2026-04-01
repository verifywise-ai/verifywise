/**
 * This file is currently in use
 */

import { Stack, Typography, Box } from "@mui/material";
import { RiskData } from "./riskkViewValues";
import {
  FC,
  useState,
  useMemo,
  useCallback,
  memo,
  lazy,
  Suspense,
  useEffect,
} from "react";
import BasicTable from "../../../components/Table";
import AddNewRiskForm from "../../../components/AddNewRiskForm";
import Popup from "../../../components/Popup";
import AddNewVendorRiskForm from "../../../components/AddNewVendorRiskForm";
import { ProjectRisk } from "../../../../application/hooks/useProjectRisks";

import { getAllEntities } from "../../../../application/repository/entity.repository";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { VendorRisk } from "../../../../domain/types/VendorRisk";
import { StatusTileCards, StatusTileItem } from "../../../components/Cards/StatusTileCards";

const Alert = lazy(() => import("../../../components/Alert"));

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
 * Main component for displaying project or vendor risks view
 * @param risksSummary Summary data for risks visualization
 * @param risksData Array of project or vendor risks
 * @param title Type of risks being displayed ("Project" or "Vendor")
 */

const RisksView: FC<RisksViewProps> = memo(
  ({ risksSummary, risksData, title, projectId }) => {
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
          id: (item as any).id || (item as any).risk_id || `${(item as ProjectRisk | VendorRisk).risk_description}_${i}`,
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
      [risksTableCols, risksTableRows]
    );

    const [selectedRow, setSelectedRow] = useState<ProjectRisk | VendorRisk | undefined>();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [riskData1, setRiskData] = useState<ProjectRisk[] | VendorRisk[]>([]);

    const [alert, setAlert] = useState<{
      variant: "success" | "info" | "warning" | "error";
      title?: string;
      body: string;
    } | null>(null);

    // Popup anchor state - moved from useCallback to component level to avoid rules-of-hooks violation
    const [addRiskAnchor, setAddRiskAnchor] = useState<null | HTMLElement>(null);
    const [addVendorRiskAnchor, setAddVendorRiskAnchor] = useState<null | HTMLElement>(null);

    /**
     * Handles closing the risk edit popup
     */
    const handleClosePopup = () => {
      setAnchorEl(null); // Close the popup

      setSelectedRow(undefined);
    };

    const handleSuccess = () => {
      handleAlert({
        variant: "success",
        body: title + " risk created successfully",
        setAlert,
      });

      fetchRiskData();
    };

    const handleUpdate = () => {
      handleAlert({
        variant: "success",
        body: title + " risk updated successfully",
        setAlert,
      });

      fetchRiskData();
    };

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

    /**
     * Handles opening/closing the Add New Risk popup
     */
    const handleAddRiskOpenOrClose = useCallback((event: React.MouseEvent<HTMLElement>) => {
      setAddRiskAnchor(addRiskAnchor ? null : event.currentTarget);
    }, [addRiskAnchor]);

    /**
     * Renders the "Add New Risk" popup component for project risks
     */
    const AddNewRiskPopupRender = useCallback(() => {
      return (
        <Popup
          popupId="add-new-risk-popup"
          popupContent={
            <AddNewRiskForm
              closePopup={() => setAddRiskAnchor(null)}
              popupStatus="new"
              onSuccess={handleSuccess}
            />
          }
          openPopupButtonName="Add new risk"
          popupTitle="Add a new risk"
          popupSubtitle="Create a detailed breakdown of risks and their mitigation strategies to assist in documenting your risk management activities effectively."
          handleOpenOrClose={handleAddRiskOpenOrClose}
          anchor={addRiskAnchor}
        />
      );
    }, [addRiskAnchor, handleAddRiskOpenOrClose, handleSuccess]);

    /**
     * Handles opening/closing the Add New Vendor Risk popup
     */
    const handleAddVendorRiskOpenOrClose = useCallback((event: React.MouseEvent<HTMLElement>) => {
      setAddVendorRiskAnchor(addVendorRiskAnchor ? null : event.currentTarget);
    }, [addVendorRiskAnchor]);

    /**
     * Renders the "Add New Vendor Risk" popup component
     */
    const AddNewVendorRiskPopupRender = useCallback(() => {
      return (
        <Popup
          popupId="add-new-vendor-risk-popup"
          popupContent={
            <AddNewVendorRiskForm
              closePopup={() => setAddVendorRiskAnchor(null)}
              onSuccess={handleSuccess}
              popupStatus="new"
            />
          }
          openPopupButtonName="Add new risk"
          popupTitle="Add a new vendor risk"
          popupSubtitle="Create a list of vendor risks"
          handleOpenOrClose={handleAddVendorRiskOpenOrClose}
          anchor={addVendorRiskAnchor}
        />
      );
    }, [addVendorRiskAnchor, handleAddVendorRiskOpenOrClose, handleSuccess]);

    return (
      <Stack>
        {alert && (
          <Suspense fallback={<div>Loading...</div>}>
            <Box>
              <Alert
                variant={alert.variant}
                title={alert.title}
                body={alert.body}
                isToast={true}
                onClick={() => setAlert(null)}
              />
            </Box>
          </Suspense>
        )}
        <StatusTileCards
          items={[
            { key: "Total", label: "Total", count: risksSummary.total, color: "#4B5563" },
            { key: "Very high", label: "Very high", count: risksSummary.veryHighRisks, color: "#C63622" },
            { key: "High", label: "High", count: risksSummary.highRisks, color: "#D68B61" },
            { key: "Medium", label: "Medium", count: risksSummary.mediumRisks, color: "#D6B971" },
            { key: "Low", label: "Low", count: risksSummary.lowRisks, color: "#52AB43" },
            { key: "Very low", label: "Very low", count: risksSummary.veryLowRisks, color: "#B8D39C" },
          ] satisfies StatusTileItem[]}
          entityName="risk"
          size="small"
        />
        <Stack
          sx={{ mt: "32px", mb: "28px" }}
          direction="row"
          justifyContent="space-between"
          alignItems="flex-end"
        >
          <Typography
            component="h2"
            sx={{ fontSize: 16, fontWeight: 600, color: "text.primary" }}
          >
            {title} risks
          </Typography>
          {title === "Project" ? (
            <AddNewRiskPopupRender />
          ) : (
            <AddNewVendorRiskPopupRender />
          )}
        </Stack>

        {Object.keys(selectedRow || {}).length > 0 &&
          anchorEl &&
          title === "Project" && (
            <Popup
              popupId="edit-new-risk-popup"
              popupContent={
                <AddNewRiskForm
                  closePopup={() => setAnchorEl(null)}
                  popupStatus="edit"
                  onSuccess={handleUpdate}
                />
              }
              openPopupButtonName="Edit risk"
              popupTitle="Edit project risk"
              handleOpenOrClose={handleClosePopup}
              anchor={anchorEl}
            />
          )}

        {Object.keys(selectedRow || {}).length > 0 &&
          anchorEl &&
          title === "Vendor" && (
            <Popup
              popupId="edit-vendor-risk-popup"
              popupContent={
                <AddNewVendorRiskForm
                  closePopup={() => setAnchorEl(null)}
                  onSuccess={handleUpdate}
                  popupStatus="edit"
                />
              }
              openPopupButtonName="Edit risk"
              popupTitle="Edit vendor risk"
              handleOpenOrClose={handleClosePopup}
              anchor={anchorEl}
            />
          )}

        {/* map the data */}
        <BasicTable
          data={tableData}
          bodyData={risksTableRows}
          table="risksTable"
          paginated
          label={`${title} risk`}
          setSelectedRow={(row) => setSelectedRow(riskData1.find(r => (r as any).id === row.id || (r as any).risk_id === row.id) as ProjectRisk | VendorRisk)}
          setAnchorEl={setAnchorEl}
        />
      </Stack>
    );
  }
);

export default RisksView;
