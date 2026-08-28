import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
} from "@mui/material";
import AutoCompleteField from "../Inputs/Autocomplete";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { useCreateRiskLink } from "../../../application/hooks/useRiskLinks";
import { CreateRiskLinkInput, RiskLink } from "../../../domain/interfaces/i.riskLink";

interface LinkRiskFormProps {
  riskId: number;
  /** The panel's current list — suggested + confirmed only. */
  existingLinks: RiskLink[];
  onClose: () => void;
}

interface Candidate {
  id: number;
  risk_name: string;
}

/** "Is inherited by" is the same relation with the ids swapped. */
type Choice = "related_to" | "inherits_from" | "inherited_by";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "related_to", label: "Relates to" },
  { value: "inherits_from", label: "Inherits from" },
  { value: "inherited_by", label: "Is inherited by" },
];

export default function LinkRiskForm({ riskId, existingLinks, onClose }: LinkRiskFormProps) {
  const [rawChoice, setRawChoice] = useState<Choice>("related_to");
  const [partner, setPartner] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createLink = useCreateRiskLink(riskId);

  /**
   * `direction: "outgoing"` means this risk is the source of the edge, and the
   * source is the child — so it has a parent. `"incoming"` means it is the
   * target, i.e. the parent, so it has children. Confirmed rows only: competing
   * SUGGESTED parents are legal, which is what lets a future agent offer a
   * choice between candidates.
   */
  const { hasParent, hasChildren } = useMemo(() => {
    const inheritance = existingLinks.filter(
      (l) => l.status === "confirmed" && l.relationType === "inherits_from",
    );
    return {
      hasParent: inheritance.some((l) => l.direction === "outgoing"),
      hasChildren: inheritance.some((l) => l.direction === "incoming"),
    };
  }, [existingLinks]);

  const disabled: Record<Choice, boolean> = {
    related_to: false,
    inherits_from: hasParent || hasChildren,
    inherited_by: hasParent,
  };

  /**
   * The third server rule — the chosen partner is already someone else's child
   * — cannot be evaluated here: the candidate list is getAllProjectRisks, which
   * carries no link data. The server's 409 explains that case, matching the
   * exclusion policy documented above.
   */
  const restriction = hasParent
    ? "This risk already has a parent, so it can only relate to other risks."
    : hasChildren
      ? "This risk has child risks, so it cannot become a child of another risk."
      : null;

  // Derived rather than reset in an effect: existingLinks can change under an
  // open form when the panel refetches, and deriving removes the stale-state
  // class of bug instead of patching one instance of it.
  const choice = disabled[rawChoice] ? "related_to" : rawChoice;

  // Org-wide, not per-project: useProjectRisks calls
  // getAllProjectRisksByProjectId and is scoped to one project.
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["projectRisks", "active"],
    queryFn: async () => {
      const response: any = await getAllProjectRisks({ filter: "active" });
      return (response?.data ?? []) as Candidate[];
    },
  });

  /**
   * Deliberately incomplete: computed from the panel's suggested + confirmed
   * list, so a dismissed partner stays selectable and the server's 409 does the
   * explaining. Hiding it would leave the user hunting for a risk they know
   * exists with no explanation.
   */
  const excludedIds = useMemo(() => {
    const ids = new Set<number>([riskId]);
    for (const link of existingLinks) {
      const blocks =
        choice === "related_to"
          ? link.relationType === "related_to"
          : link.relationType === "inherits_from";
      if (blocks) ids.add(link.relatedRisk.id);
    }
    return ids;
  }, [existingLinks, choice, riskId]);

  const options = useMemo(
    () => candidates.filter((candidate) => !excludedIds.has(candidate.id)),
    [candidates, excludedIds],
  );

  const handleChoice = (next: Choice) => {
    setRawChoice(next);
    setError(null);
    // The chosen partner may be excluded under the new relation type.
    setPartner(null);
  };

  const handleSubmit = () => {
    if (!partner) return;
    setError(null);
    const input: CreateRiskLinkInput =
      choice === "inherited_by"
        ? { sourceRiskId: partner.id, targetRiskId: riskId, relationType: "inherits_from" }
        : { sourceRiskId: riskId, targetRiskId: partner.id, relationType: choice };

    createLink.mutate(input, {
      onSuccess: () => onClose(),
      onError: (mutationError: any) =>
        setError(
          mutationError?.status === 404
            ? "One of these risks no longer exists"
            : mutationError?.message || "Failed to create the link",
        ),
    });
  };

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <RadioGroup row value={choice} onChange={(event) => handleChoice(event.target.value as Choice)}>
        {CHOICES.map(({ value, label }) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio disabled={disabled[value]} />}
            label={label}
            disabled={disabled[value]}
          />
        ))}
      </RadioGroup>

      {restriction && <Alert severity="info">{restriction}</Alert>}
      <AutoCompleteField<Candidate>
        label="Risk"
        placeholder="Search risks"
        options={options}
        value={partner}
        getOptionLabel={(option) => option.risk_name}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        onChange={(_event, selected) => {
          setPartner(selected);
          setError(null);
        }}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={!partner || createLink.isPending}
          onClick={handleSubmit}
        >
          Link
        </Button>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
