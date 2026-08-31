import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
} from "@mui/material";
import AutoCompleteField from "../Inputs/Autocomplete";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { getAllVendorRisks } from "../../../application/repository/vendorRisk.repository";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { useCreateRiskLink, useSharedProjects } from "../../../application/hooks/useRiskLinks";
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

type ParentSource = "risk" | "model_risk" | "vendor_risk";

const PARENT_SOURCES: { value: ParentSource; label: string }[] = [
  { value: "risk", label: "Project risk" },
  { value: "model_risk", label: "Model risk" },
  { value: "vendor_risk", label: "Vendor risk" },
];

export default function LinkRiskForm({ riskId, existingLinks, onClose }: LinkRiskFormProps) {
  const [rawChoice, setRawChoice] = useState<Choice>("related_to");
  const [rawSource, setRawSource] = useState<ParentSource>("risk");
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
  const source: ParentSource = choice === "inherits_from" ? rawSource : "risk";

  // Org-wide, not per-project: useProjectRisks calls
  // getAllProjectRisksByProjectId and is scoped to one project.
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["projectRisks", "active"],
    queryFn: async () => {
      const response: any = await getAllProjectRisks({ filter: "active" });
      return (response?.data ?? []) as Candidate[];
    },
  });

  const { data: crossEntityCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["riskLinkParents", source],
    enabled: source !== "risk",
    queryFn: async () => {
      const response: any =
        source === "vendor_risk"
          ? await getAllVendorRisks({ filter: "active" })
          : await getAllEntities({ routeUrl: "/modelRisks" });
      const rows = (response?.data ?? []) as any[];
      return rows.map((row) => ({
        id: row.id,
        risk_name:
          source === "vendor_risk"
            ? (row.risk_description ?? "").slice(0, 80) || "Untitled vendor risk"
            : row.risk_name || "Untitled model risk",
      }));
    },
  });

  const { data: sharedProjects = [] } = useSharedProjects(riskId, source !== "risk");

  /**
   * Candidate id -> shared project titles, for the currently selected source
   * only. Filtering by `entityType` is what keeps a model risk id from ranking a
   * vendor risk that happens to share that id.
   */
  const sharedByCandidate = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const candidate of sharedProjects) {
      if (candidate.entityType === source) map.set(candidate.id, candidate.projects);
    }
    return map;
  }, [sharedProjects, source]);

  /**
   * Deliberately incomplete: computed from the panel's suggested + confirmed
   * list, so a dismissed partner stays selectable and the server's 409 does the
   * explaining. Hiding it would leave the user hunting for a risk they know
   * exists with no explanation.
   */
  const excludedKeys = useMemo(() => {
    const keys = new Set<string>([`risk:${riskId}`]);
    for (const link of existingLinks) {
      const blocks =
        choice === "related_to"
          ? link.relationType === "related_to"
          : link.relationType === "inherits_from";
      if (blocks) keys.add(`${link.relatedRisk.entityType}:${link.relatedRisk.id}`);
    }
    return keys;
  }, [existingLinks, choice, riskId]);

  const options = useMemo(() => {
    const pool = source === "risk" ? candidates : crossEntityCandidates;
    const visible = pool.filter((candidate) => !excludedKeys.has(`${source}:${candidate.id}`));
    // A stable partition, not a sort: each group keeps the server's order, and
    // nothing is removed — a candidate sharing no project stays selectable.
    return [
      ...visible.filter((candidate) => sharedByCandidate.has(candidate.id)),
      ...visible.filter((candidate) => !sharedByCandidate.has(candidate.id)),
    ];
  }, [candidates, crossEntityCandidates, source, excludedKeys, sharedByCandidate]);

  const handleChoice = (next: Choice) => {
    setRawChoice(next);
    setError(null);
    // The chosen partner may be excluded under the new relation type.
    setPartner(null);
  };

  const handleSource = (next: ParentSource) => {
    setRawSource(next);
    setError(null);
    setPartner(null);
  };

  const handleSubmit = () => {
    if (!partner) return;
    setError(null);
    const input: CreateRiskLinkInput =
      choice === "inherited_by"
        ? { sourceRiskId: partner.id, targetRiskId: riskId, relationType: "inherits_from" }
        : source === "model_risk"
          ? { sourceRiskId: riskId, targetModelRiskId: partner.id, relationType: "inherits_from" }
          : source === "vendor_risk"
            ? { sourceRiskId: riskId, targetVendorRiskId: partner.id, relationType: "inherits_from" }
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

      {choice === "inherits_from" && (
        <RadioGroup
          row
          value={source}
          onChange={(event) => handleSource(event.target.value as ParentSource)}
        >
          {PARENT_SOURCES.map(({ value, label }) => (
            <FormControlLabel
              key={value}
              value={value}
              control={<Radio />}
              label={label}
            />
          ))}
        </RadioGroup>
      )}

      {restriction && <Alert severity="info">{restriction}</Alert>}
      <AutoCompleteField<Candidate>
        label={PARENT_SOURCES.find((s) => s.value === source)!.label}
        placeholder="Search risks"
        options={options}
        value={partner}
        getOptionLabel={(option) => option.risk_name}
        renderOption={(props, option) => {
          const shared = sharedByCandidate.get(option.id);
          return (
            <li {...props} key={`${source}:${option.id}`}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ width: "100%", justifyContent: "space-between" }}
              >
                <span>{option.risk_name}</span>
                {shared && shared.length > 0 && (
                  <Chip
                    size="small"
                    label={
                      shared.length > 1
                        ? `Same project: ${shared[0]} +${shared.length - 1}`
                        : `Same project: ${shared[0]}`
                    }
                  />
                )}
              </Stack>
            </li>
          );
        }}
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
