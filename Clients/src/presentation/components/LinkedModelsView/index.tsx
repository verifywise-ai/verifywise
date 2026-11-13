import { useEffect, useState, ReactNode } from "react";
import {
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from "@mui/material";
import { useNavigate } from "react-router";
import { Cpu } from "lucide-react";
import { IModelInventory } from "../../../domain/interfaces/i.modelInventory";
import CustomizableSkeleton from "../Skeletons";
import singleTheme from "../../themes/v1SingleTheme";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import { EmptyState } from "../EmptyState";
import { TableEmptyStateLayout } from "../Table/TableEmptyStateLayout";
import { VWLink } from "../Link";
import InfoBox from "../InfoBox";
import { palette, radiusPx } from "../../themes/palette";

const TABLE_COLUMNS = [
  { id: "provider", label: "PROVIDER" },
  { id: "model", label: "MODEL" },
  { id: "version", label: "VERSION" },
  { id: "status", label: "STATUS" },
];

function StatusBadge({ status }: { status: ModelInventoryStatus }) {
  const statusStyles = {
    [ModelInventoryStatus.APPROVED]: {
      bg: palette.status.success.bg,
      color: palette.status.success.text,
    },
    [ModelInventoryStatus.PENDING]: { bg: palette.risk.medium.bg, color: palette.risk.medium.text },
    [ModelInventoryStatus.RESTRICTED]: { bg: "#FFE5D0", color: "#E64A19" },
    [ModelInventoryStatus.BLOCKED]: {
      bg: palette.status.error.border,
      color: palette.status.error.text,
    },
    [ModelInventoryStatus.REJECTED]: { bg: palette.background.hover, color: palette.text.tertiary },
    [ModelInventoryStatus.RETIRED]: { bg: palette.background.hover, color: "#546E7A" },
  };

  const style = statusStyles[status] || { bg: palette.border.light, color: palette.text.secondary };

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 8px",
        borderRadius: radiusPx.sm,
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase",
        display: "inline-block",
      }}
    >
      {status}
    </span>
  );
}

interface LinkedModelsViewProps {
  // Function to fetch models - should return Promise<IModelInventory[]>
  fetchModels: () => Promise<IModelInventory[]>;
  // Optional header content (e.g., framework toggle)
  headerContent?: ReactNode;
  // Refresh trigger for forcing re-fetches
  refreshTrigger?: number;
  // Empty state message
  emptyMessage?: string;
}

export function LinkedModelsView({
  fetchModels,
  headerContent,
  refreshTrigger,
  emptyMessage = "No AI models linked yet",
}: LinkedModelsViewProps) {
  const [linkedModels, setLinkedModels] = useState<IModelInventory[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoadingModels(true);
      try {
        const models = await fetchModels();
        setLinkedModels(models);
      } catch (error) {
        console.error("Error fetching linked models:", error);
        setLinkedModels([]);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchData();
  }, [fetchModels, refreshTrigger]);

  if (loadingModels) {
    return (
      <Stack spacing={3}>
        {headerContent}
        <Stack sx={{ pt: 2 }}>
          <CustomizableSkeleton variant="rectangular" width="100%" height={300} />
        </Stack>
      </Stack>
    );
  }

  if (linkedModels.length === 0) {
    return (
      <Stack spacing={3}>
        {headerContent}
        <TableEmptyStateLayout
          header={
            <TableHead
              sx={{
                backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
              }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {TABLE_COLUMNS.map((column) => (
                  <TableCell key={column.id} sx={singleTheme.tableStyles.primary.header.cell}>
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
          }
        >
          <EmptyState icon={Cpu} message={emptyMessage}>
            <Typography
              sx={{
                color: theme.palette.text.tertiary,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              To link a model to this framework, you first need to add it to your model inventory.
              When adding a model, you can select which framework(s) to link it to.{" "}
              <VWLink onClick={() => navigate("/model-inventory")}>Go to Model Inventory</VWLink>
            </Typography>
          </EmptyState>
        </TableEmptyStateLayout>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {headerContent}
      {/* Info Box */}
      <InfoBox
        message="Models added to the Model Inventory that are linked to this use case will appear here."
        storageKey="linkedModels_explanation"
      />
      <Stack sx={{ pt: 2 }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <TableHead
              sx={{
                backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
              }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {TABLE_COLUMNS.map((column) => (
                  <TableCell key={column.id} sx={singleTheme.tableStyles.primary.header.cell}>
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {linkedModels.map((model) => (
                <TableRow
                  key={model.id}
                  onClick={() => model.id && navigate(`/model-inventory?modelId=${model.id}`)}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    "&:hover": {
                      cursor: model.id ? "pointer" : "default",
                      backgroundColor: "background.accent",
                    },
                    "&:hover td": {
                      backgroundColor: "background.accent",
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {model.provider || "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {model.model || "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {model.version || "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <StatusBadge status={model.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Stack>
  );
}
