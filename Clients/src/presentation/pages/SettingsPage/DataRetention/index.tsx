import { useState } from "react";
import {
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { AlertTriangle } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import singleTheme from "../../../themes/v1SingleTheme";
import { useDataRetention } from "../../../../application/hooks/useDataRetention";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import type { RetentionRow } from "../../../../application/repository/dataRetention.repository";
import { fill } from "../../../../i18n/fill";
import EditRetentionModal from "./EditRetentionModal";
import {
  ROW_TITLES,
  automaticDeletionLabel,
  lastCleanupLabel,
  periodLabel,
} from "./retentionLabels";

const cellStyle = singleTheme.tableStyles.primary.body.cell;
const headerCellStyle = singleTheme.tableStyles.primary.header.cell;

export default function DataRetention() {
  const theme = useTheme();
  const { t } = useTranslation();
  const formatDate = useFormattedDate();
  const { data, isLoading, isError, refetch } = useDataRetention();
  const [editing, setEditing] = useState<RetentionRow | null>(null);

  if (isLoading) {
    return (
      <Stack sx={{ alignItems: "center", py: "32px" }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  // A failed load must not look like an empty table.
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        message={t("Retention settings could not be loaded.")}
        imageAlt={t("Retention settings could not be loaded.")}
      >
        <Stack sx={{ alignItems: "center" }}>
          <CustomizableButton
            variant="outlined"
            text={t("Try again")}
            onClick={() => refetch()}
            sx={{ height: "30px" }}
            testId="retention-retry"
          />
        </Stack>
      </EmptyState>
    );
  }

  const rows = data?.rows ?? [];

  const renderAction = (row: RetentionRow) => {
    if (row.unavailable) {
      return <Typography sx={{ fontSize: 13 }}>{t("Unavailable")}</Typography>;
    }
    if (row.source === "deployment") {
      return (
        <Typography sx={{ fontSize: 13 }}>
          {fill(t("Set by deployment: {setting}"), { setting: row.deploymentSetting ?? "" })}
        </Typography>
      );
    }
    return (
      <CustomizableButton
        variant="outlined"
        text={t("Edit")}
        onClick={() => setEditing(row)}
        sx={{ height: "30px" }}
        testId={`retention-edit-${row.key}`}
        ariaLabel={fill(t("Edit retention: {name}"), { name: t(ROW_TITLES[row.key].title) })}
      />
    );
  };

  return (
    <Stack sx={{ gap: "16px" }}>
      {data?.auditPrunedThrough && (
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
          {fill(t("Audit records before {date} were removed by the retention policy."), {
            date: formatDate(new Date(data.auditPrunedThrough.cutoff)),
          })}
        </Typography>
      )}
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          <TableHead>
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
              <TableCell sx={headerCellStyle}>{t("Records")}</TableCell>
              <TableCell sx={headerCellStyle}>{t("Kept for")}</TableCell>
              <TableCell sx={headerCellStyle}>{t("Automatic deletion")}</TableCell>
              <TableCell sx={headerCellStyle}>{t("Last cleanup")}</TableCell>
              <TableCell sx={headerCellStyle} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const { title, description } = ROW_TITLES[row.key];
              return (
                <TableRow
                  key={row.key}
                  sx={singleTheme.tableStyles.primary.body.row}
                  data-testid={`retention-row-${row.key}`}
                >
                  <TableCell sx={cellStyle}>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{t(title)}</Typography>
                    {description && (
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                        {t(description)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    {row.unavailable
                      ? "—"
                      : row.usesDeploymentDefault
                        ? fill(t("{period} (deployment default)"), {
                            period: periodLabel(t, row.period),
                          })
                        : periodLabel(t, row.period)}
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    {row.unavailable ? "—" : automaticDeletionLabel(t, row.automaticDeletion)}
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    {lastCleanupLabel(t, row, (date) => formatDate(date))}
                  </TableCell>
                  <TableCell sx={cellStyle}>{renderAction(row)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && <EditRetentionModal row={editing} rows={rows} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
