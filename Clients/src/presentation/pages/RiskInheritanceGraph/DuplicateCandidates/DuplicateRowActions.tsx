/**
 * @fileoverview Row actions for one duplicate pair.
 *
 * The report itself stays read-only; these actions are the ways a reader acts
 * on a pair, each through an existing endpoint: open either risk, record the
 * pair as related, or delete one side. Looks and behaves like the site's
 * standard row menu (components/IconButton): gear button, dropdown, a
 * confirmation before anything destructive, toast feedback.
 */

import { useState } from "react";
import { IconButton as MuiIconButton, Menu, MenuItem, Typography, useTheme } from "@mui/material";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import singleTheme from "../../../themes/v1SingleTheme";
import type { AlertProps } from "../../../types/alert.types";
import { createRiskLink } from "../../../../application/repository/riskLink.repository";
import { deleteEntityById } from "../../../../application/repository/entity.repository";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { DuplicateCandidate } from "../../../../domain/interfaces/i.riskLink";
import { fill } from "../../../../i18n/fill";

type PairRisk = DuplicateCandidate["risk_a"];

interface DuplicateRowActionsProps {
  candidate: DuplicateCandidate;
  /** Called after a risk was deleted, so the report can drop the pair. */
  onRiskDeleted: () => void;
  /**
   * Feedback is shown by the report, not the row: a delete reloads the report
   * and unmounts this row, which would take a row-owned toast with it.
   */
  onNotify: (alert: AlertProps) => void;
}

const DuplicateRowActions: React.FC<DuplicateRowActionsProps> = ({
  candidate,
  onRiskDeleted,
  onNotify,
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PairRisk | null>(null);
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);

  const { risk_a: riskA, risk_b: riskB } = candidate;
  const otherRisk = (risk: PairRisk) => (risk.id === riskA.id ? riskB : riskA);

  const closeMenu = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setAnchorEl(null);
  };

  const openRisk = (risk: PairRisk) => {
    closeMenu();
    // RiskManagement opens the risk's edit modal from ?riskId=.
    navigate(`/risk-management?riskId=${risk.id}`);
  };

  const linkAsRelated = async () => {
    closeMenu();
    setBusy(true);
    try {
      // The server stores related_to canonically, so either order is fine.
      await createRiskLink({
        sourceRiskId: riskA.id,
        targetRiskId: riskB.id,
        relationType: "related_to",
      });
      setLinked(true);
      onNotify({ variant: "success", body: "The two risks are now linked as related." });
    } catch (error) {
      onNotify({
        variant: "error",
        body: error instanceof Error ? error.message : "Failed to link the risks.",
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteRisk = async (risk: PairRisk) => {
    setPendingDelete(null);
    setBusy(true);
    try {
      // Same sequence as the Risk Management page: soft-delete the risk, then
      // drop its policy links so no policy points at a deleted risk.
      const response = await deleteEntityById({ routeUrl: `/projectRisks/${risk.id}` });
      if (response.status !== 200) {
        onNotify({
          variant: "error",
          body: response.status === 404 ? "Risk not found." : "Failed to delete the risk.",
        });
        return;
      }
      try {
        await deleteEntityById({ routeUrl: `/policy-linked/risk/${risk.id}/unlink-all` });
      } catch {
        onNotify({
          variant: "warning",
          body: "Risk deleted but failed to remove it from some linked policies.",
        });
        onRiskDeleted();
        return;
      }
      onNotify({
        variant: "success",
        body: fill(t('Deleted "{name}".'), { name: risk.risk_name }),
      });
      onRiskDeleted();
    } catch (error) {
      onNotify({
        variant: "error",
        body: error instanceof Error ? error.message : "Failed to delete the risk.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <MuiIconButton
        disableRipple={theme.components?.MuiIconButton?.defaultProps?.disableRipple}
        sx={singleTheme.iconButtons}
        aria-label="Duplicate pair actions"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          setAnchorEl(event.currentTarget);
        }}
      >
        <Settings size={20} />
      </MuiIconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={(e: React.SyntheticEvent) => closeMenu(e)}
        slotProps={{ paper: { sx: singleTheme.dropDownStyles.primary } }}
      >
        <MenuItem onClick={() => openRisk(riskA)}>
          {fill(t("Open risk #{id}"), { id: riskA.id })}
        </MenuItem>
        <MenuItem onClick={() => openRisk(riskB)}>
          {fill(t("Open risk #{id}"), { id: riskB.id })}
        </MenuItem>
        <MenuItem
          onClick={linkAsRelated}
          disabled={linked}
          sx={{ color: theme.palette.primary.main }}
        >
          {linked ? "Linked as related" : "Link as related"}
        </MenuItem>
        {[riskA, riskB].map((risk) => (
          <MenuItem
            key={risk.id}
            onClick={(e) => {
              closeMenu(e);
              setPendingDelete(risk);
            }}
            sx={{ color: theme.palette.error.main }}
          >
            {fill(t("Delete risk #{id}"), { id: risk.id })}
          </MenuItem>
        ))}
      </Menu>

      {pendingDelete && (
        <ConfirmationModal
          isOpen
          title="Delete this risk?"
          body={
            <Typography fontSize={13} color={theme.palette.text.primary}>
              {fill(
                t(
                  "“{name}” (#{id}) will be deleted. Its possible duplicate “{otherName}” (#{otherId}) stays.",
                ),
                {
                  name: pendingDelete.risk_name,
                  id: pendingDelete.id,
                  otherName: otherRisk(pendingDelete).risk_name,
                  otherId: otherRisk(pendingDelete).id,
                },
              )}
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete risk"
          onCancel={() => setPendingDelete(null)}
          onProceed={() => deleteRisk(pendingDelete)}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
    </>
  );
};

export default DuplicateRowActions;
