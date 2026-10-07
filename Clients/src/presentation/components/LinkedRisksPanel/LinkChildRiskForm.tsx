import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Stack, Typography } from "@mui/material";
import AutoCompleteField from "../Inputs/Autocomplete";
import { CustomizableButton } from "../button/customizable-button";
import { textStyles } from "../../themes/typography";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import {
  useCreateVendorRiskLink,
  useVendorRiskSharedProjects,
} from "../../../application/hooks/useRiskLinks";
import { RiskLink } from "../../../domain/interfaces/i.riskLink";
import { SameProjectChip } from "./LinkRiskForm";

interface LinkChildRiskFormProps {
  vendorRiskId: number;
  /** The panel's current list — suggested + confirmed only. */
  existingLinks: RiskLink[];
  onClose: () => void;
}

interface Candidate {
  id: number;
  risk_name: string;
}

/**
 * Links a project risk as a child of this vendor risk. There is only one thing
 * to choose: a vendor risk is never a child and never in a `related_to` pair,
 * so the relation and the parent are both fixed.
 */
export default function LinkChildRiskForm({
  vendorRiskId,
  existingLinks,
  onClose,
}: LinkChildRiskFormProps) {
  const [child, setChild] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createLink = useCreateVendorRiskLink();

  // Same query and key as LinkRiskForm, so the two pickers share one cache.
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["projectRisks", "active"],
    queryFn: async () => {
      const response: any = await getAllProjectRisks({ filter: "active" });
      return (response?.data ?? []) as Candidate[];
    },
  });

  const { data: sharedProjects = [] } = useVendorRiskSharedProjects(vendorRiskId, true);

  const sharedByCandidate = useMemo(
    () => new Map(sharedProjects.map((candidate) => [candidate.id, candidate.projects])),
    [sharedProjects],
  );

  /**
   * Only the risks already in this list. Whether a candidate already has some
   * other parent, or children of its own, is not in getAllProjectRisks — the
   * hint below says so up front and the server's 409 explains the case.
   */
  const options = useMemo(() => {
    const linked = new Set(existingLinks.map((link) => link.relatedRisk.id));
    const visible = candidates.filter((candidate) => !linked.has(candidate.id));
    // A stable partition, as in LinkRiskForm: risks in the vendor's projects
    // first, every other risk still selectable after them.
    return [
      ...visible.filter((candidate) => sharedByCandidate.has(candidate.id)),
      ...visible.filter((candidate) => !sharedByCandidate.has(candidate.id)),
    ];
  }, [candidates, existingLinks, sharedByCandidate]);

  const handleSubmit = () => {
    if (!child) return;
    setError(null);
    createLink.mutate(
      { sourceRiskId: child.id, targetVendorRiskId: vendorRiskId, relationType: "inherits_from" },
      {
        onSuccess: () => onClose(),
        onError: (mutationError: any) =>
          setError(
            mutationError?.status === 404
              ? "One of these risks no longer exists"
              : mutationError?.message || "Failed to create the link",
          ),
      },
    );
  };

  return (
    <Stack spacing={4} sx={{ py: 4 }}>
      <AutoCompleteField<Candidate>
        label="Project risk"
        placeholder="Search risks"
        options={options}
        value={child}
        getOptionLabel={(option) => option.risk_name}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Stack
              direction="row"
              spacing={4}
              alignItems="center"
              sx={{ width: "100%", justifyContent: "space-between" }}
            >
              <span>{option.risk_name}</span>
              <SameProjectChip projects={sharedByCandidate.get(option.id) ?? []} />
            </Stack>
          </li>
        )}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        onChange={(_event, selected) => {
          setChild(selected);
          setError(null);
        }}
      />
      <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
        A project risk can have only one parent, and a risk with child risks of its own cannot
        become a child.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={4}>
        <CustomizableButton
          size="small"
          variant="contained"
          color="primary"
          isDisabled={!child || createLink.isPending}
          onClick={handleSubmit}
        >
          Link
        </CustomizableButton>
        <CustomizableButton size="small" variant="text" color="secondary" onClick={onClose}>
          Cancel
        </CustomizableButton>
      </Stack>
    </Stack>
  );
}
