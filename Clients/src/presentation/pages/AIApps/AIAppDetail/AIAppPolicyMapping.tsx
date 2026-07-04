import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  IconButton,
} from "@mui/material";
import { Sparkles, ShieldCheck, CirclePlus, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import AutoCompleteField from "../../../components/Inputs/Autocomplete";
import StandardModal from "../../../components/Modals/StandardModal";
import {
  useSetPoliciesForAiApp,
  usePolicySuggestions,
} from "../../../../application/hooks/useAiApps";
import { usePolicies } from "../../../../application/hooks/usePolicies";
import { IAIAppPolicy } from "../../../../domain/interfaces/i.aiApp";
import { AiAppPolicyStatus } from "../../../../domain/enums/aiApp.enum";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import Alert from "../../../components/Alert";
import StandardTableHead from "../../../components/Table/StandardTableHead";
import StandardTablePagination from "../../../components/Table/StandardTablePagination";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

interface AIAppPolicyMappingProps {
  appId: number;
  appName: string;
  policies: IAIAppPolicy[];
}

interface LinkedPolicy {
  policy_id: number;
  title: string;
}

interface PolicyOption {
  id: number;
  label: string;
}

const TABLE_COLUMNS: StandardColumn[] = [
  { id: "title", label: "Policy", sortable: true },
  { id: "actions", label: "", sortable: false },
];

export default function AIAppPolicyMapping({ appId, appName, policies }: AIAppPolicyMappingProps) {
  // Only the policies linked to this app — not the whole org catalog.
  const [linkedPolicies, setLinkedPolicies] = useState<LinkedPolicy[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<PolicyOption[]>([]);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
  } | null>(null);

  // Auto-dismiss toasts after 3s.
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const { data: allPolicies } = usePolicies();
  const { data: suggestions } = usePolicySuggestions(appName);
  const setPoliciesMutation = useSetPoliciesForAiApp();

  // Seed the linked list from the policies already mapped to this app.
  useEffect(() => {
    setLinkedPolicies(policies.map((p) => ({ policy_id: p.id, title: p.title })));
  }, [policies]);

  // Org policies that aren't linked yet — the candidates for the add modal.
  const addableOptions = useMemo<PolicyOption[]>(() => {
    const linkedIds = new Set(linkedPolicies.map((p) => p.policy_id));
    return (allPolicies ?? [])
      .filter((policy: PolicyManagerModel) => !linkedIds.has(policy.id))
      .map((policy: PolicyManagerModel) => ({ id: policy.id, label: policy.title }));
  }, [allPolicies, linkedPolicies]);

  const persist = useCallback(
    async (next: LinkedPolicy[]) => {
      try {
        await setPoliciesMutation.mutateAsync({
          id: appId,
          policies: next.map((p) => ({
            policy_id: p.policy_id,
            status: AiAppPolicyStatus.APPLICABLE,
          })),
        });
        setAlert({ variant: "success", body: "Policy mapping saved" });
      } catch (err) {
        setAlert({ variant: "error", body: "Failed to save policy mapping" });
        // Re-seed from the server-truth prop so the UI doesn't drift on failure.
        setLinkedPolicies(policies.map((p) => ({ policy_id: p.id, title: p.title })));
      }
    },
    [appId, policies, setPoliciesMutation],
  );

  const handleConfirmAdd = async () => {
    if (toAdd.length === 0) {
      setIsAddOpen(false);
      return;
    }
    const next = [...linkedPolicies, ...toAdd.map((o) => ({ policy_id: o.id, title: o.label }))];
    setLinkedPolicies(next);
    setIsAddOpen(false);
    setToAdd([]);
    await persist(next);
  };

  const handleRemove = async (policyId: number) => {
    const next = linkedPolicies.filter((p) => p.policy_id !== policyId);
    setLinkedPolicies(next);
    await persist(next);
  };

  const handleAddSuggested = async (title: string) => {
    const match = (allPolicies ?? []).find((p: PolicyManagerModel) => p.title === title);
    if (!match || linkedPolicies.some((p) => p.policy_id === match.id)) return;
    const next = [...linkedPolicies, { policy_id: match.id, title: match.title }];
    setLinkedPolicies(next);
    await persist(next);
  };

  // Suggested policies that aren't already linked.
  const suggestedTitles = useMemo(() => {
    const linkedTitles = new Set(linkedPolicies.map((p) => p.title));
    return (suggestions ?? [])
      .filter((s) => s.suggested && s.id !== null && !linkedTitles.has(s.title))
      .map((s) => s.title);
  }, [suggestions, linkedPolicies]);

  const sortComparator = useCallback((a: LinkedPolicy, b: LinkedPolicy, key: string): number => {
    if (key === "title") return (a.title || "").localeCompare(b.title || "");
    return 0;
  }, []);

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable<LinkedPolicy>({
    rows: linkedPolicies,
    storageKey: "aiAppPolicyMapping",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator,
  });

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        sx={{ mb: "16px" }}
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <ShieldCheck size={16} strokeWidth={1.5} color={palette.text.secondary} />
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Policy mapping</Typography>
        </Stack>
        <CustomizableButton
          text="Add policy"
          variant="contained"
          icon={<CirclePlus size={14} strokeWidth={1.5} />}
          onClick={() => {
            setToAdd([]);
            setIsAddOpen(true);
          }}
          disabled={setPoliciesMutation.isPending}
        />
      </Stack>

      {suggestedTitles.length > 0 && (
        <Box
          sx={{
            mb: "16px",
            p: "16px",
            borderRadius: "4px",
            backgroundColor: palette.background.accent,
            border: `1px solid ${palette.border.light}`,
          }}
        >
          <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "8px" }}>
            <Sparkles size={14} strokeWidth={1.5} color={palette.text.secondary} />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Suggested policies</Typography>
          </Stack>
          <Stack direction="row" gap="8px" flexWrap="wrap">
            {suggestedTitles.map((title) => (
              <CustomizableButton
                key={title}
                text={`+ ${title}`}
                variant="outlined"
                size="small"
                onClick={() => handleAddSuggested(title)}
                disabled={setPoliciesMutation.isPending}
              />
            ))}
          </Stack>
        </Box>
      )}

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <StandardTableHead columns={TABLE_COLUMNS} sortConfig={sortConfig} onSort={handleSort} />
          <TableBody>
            {totalCount > 0 ? (
              sortedRows
                .slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage)
                .map((policy) => (
                  <TableRow key={policy.policy_id} sx={singleTheme.tableStyles.primary.body.row}>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {policy.title}
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.body.cell, textAlign: "right" }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => handleRemove(policy.policy_id)}
                        disabled={setPoliciesMutation.isPending}
                        aria-label={`Remove ${policy.title}`}
                      >
                        <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMNS.length}
                  sx={singleTheme.tableStyles.primary.body.cell}
                >
                  No policies linked yet. Use "Add policy" to map applicable policies to this app.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {totalCount > 0 && (
            <StandardTablePagination
              totalCount={totalCount}
              page={validPage}
              rowsPerPage={rowsPerPage}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              getRange={getRange}
              entityLabel="policy"
              entityLabelPlural="policies"
              colSpan={TABLE_COLUMNS.length}
            />
          )}
        </Table>
      </TableContainer>

      <StandardModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add policies"
        description="Select the policies that apply to this AI app."
        onSubmit={handleConfirmAdd}
        submitButtonText="Add"
        isSubmitting={setPoliciesMutation.isPending}
        maxWidth="480px"
      >
        <AutoCompleteField<PolicyOption, true>
          multiple
          label="Policies"
          placeholder={
            addableOptions.length === 0 ? "All policies are already linked" : "Select policies"
          }
          options={addableOptions}
          value={toAdd}
          onChange={(_e, value) => setToAdd(value as PolicyOption[])}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, val) => option.id === val.id}
          disabled={addableOptions.length === 0}
        />
      </StandardModal>

      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}
    </Box>
  );
}
