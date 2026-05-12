/**
 * SuppressionRulesTab
 *
 * Settings tab listing the organization's AI detection suppression rules with a
 * delete-with-confirm action. Rules are created from the findings page; this
 * tab is read + delete only.
 */

import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Trash2 } from "lucide-react";
import dayjs from "dayjs";
import StandardModal from "../../../components/Modals/StandardModal";
import { palette } from "../../../themes/palette";
import {
  listSuppressions,
  deleteSuppression,
} from "../../../../application/repository/aiDetection.repository";
import { SuppressionRule } from "../../../../domain/ai-detection/types";

interface SuppressionRulesTabProps {
  onMessage?: (variant: "success" | "error", body: string) => void;
}

const FIELD_LABELS: Record<SuppressionRule["field"], string> = {
  name: "Name",
  finding_type: "Finding type",
  category: "Category",
  provider: "Provider",
};

const MATCH_LABELS: Record<SuppressionRule["match_type"], string> = {
  exact: "Exact",
  pattern: "Pattern",
};

function formatExpiry(expires_at: string | null | undefined): string {
  if (!expires_at) return "Never";
  const d = dayjs(expires_at);
  const isPast = d.isBefore(dayjs());
  return `${d.format("MMM D, YYYY")}${isPast ? " (expired)" : ""}`;
}

function SuppressionRulesTab({ onMessage }: SuppressionRulesTabProps) {
  const [rules, setRules] = useState<SuppressionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<SuppressionRule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await listSuppressions({ includeExpired: true });
      setRules(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load suppression rules";
      onMessage?.("error", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteSuppression(pendingDelete.id);
      onMessage?.("success", "Suppression rule deleted");
      setPendingDelete(null);
      await loadRules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete suppression rule";
      onMessage?.("error", msg);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (rules.length === 0) {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 8,
          border: `1px dashed ${palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: palette.background.main,
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>
          No suppression rules yet
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, maxWidth: 480, mx: "auto" }}>
          Create rules from any finding's row menu on the scan results page. Matching findings will
          be hidden from future scans and excluded from risk scores.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 2 }}>
        Rules suppress matching findings on future scans. Existing past findings are not affected;
        delete a rule to stop suppressing matches in subsequent scans.
      </Typography>

      <TableContainer
        sx={{
          border: `1px solid ${palette.border.light}`,
          borderRadius: "4px",
          backgroundColor: palette.background.main,
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Field</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Match</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Value</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Reason</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Expires</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Created</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 80 }} align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id} hover>
                <TableCell sx={{ fontSize: 13 }}>{FIELD_LABELS[rule.field]}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{MATCH_LABELS[rule.match_type]}</TableCell>
                <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>{rule.value}</TableCell>
                <TableCell sx={{ fontSize: 13, color: palette.text.tertiary }}>
                  {rule.reason || "—"}
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{formatExpiry(rule.expires_at)}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>
                  {dayjs(rule.created_at).format("MMM D, YYYY")}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Delete rule" arrow placement="top">
                    <IconButton
                      size="small"
                      aria-label="Delete suppression rule"
                      onClick={() => setPendingDelete(rule)}
                      sx={{ color: palette.status.error.text }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <StandardModal
        isOpen={Boolean(pendingDelete)}
        onClose={() => !isDeleting && setPendingDelete(null)}
        title="Delete suppression rule?"
        description={
          pendingDelete
            ? `Future scans will no longer auto-suppress findings where ${
                FIELD_LABELS[pendingDelete.field]
              } ${MATCH_LABELS[pendingDelete.match_type].toLowerCase()}-matches "${pendingDelete.value}".`
            : ""
        }
        onSubmit={handleDelete}
        submitButtonText="Delete"
        submitButtonColor="#c62828"
        isSubmitting={isDeleting}
      />
    </Box>
  );
}

export default SuppressionRulesTab;
