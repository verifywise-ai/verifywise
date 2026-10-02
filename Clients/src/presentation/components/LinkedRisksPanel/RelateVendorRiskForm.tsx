import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Stack, Typography } from "@mui/material";
import AutoCompleteField from "../Inputs/Autocomplete";
import Chip from "../Chip";
import { CustomizableButton } from "../button/customizable-button";
import { textStyles } from "../../themes/typography";
import { getAllVendorRisks } from "../../../application/repository/vendorRisk.repository";
import { useCreateVendorRiskLink } from "../../../application/hooks/useRiskLinks";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { RiskLink } from "../../../domain/interfaces/i.riskLink";

interface RelateVendorRiskFormProps {
  vendorRiskId: number;
  /** The panel's current list — suggested + confirmed only. */
  existingLinks: RiskLink[];
  onClose: () => void;
}

/** One vendor risk as the picker shows it. */
export interface VendorRiskOption {
  id: number;
  description: string;
  vendorId: number | null;
  vendorName: string | null;
}

/**
 * The all-risks endpoint returns one row per (vendor risk, use case); the
 * picker wants one per vendor risk.
 */
export function toVendorRiskOptions(rows: any[]): VendorRiskOption[] {
  const byId = new Map<number, VendorRiskOption>();
  for (const row of rows) {
    if (row?.risk_id == null || byId.has(row.risk_id)) continue;
    byId.set(row.risk_id, {
      id: row.risk_id,
      description: row.risk_description ?? "",
      vendorId: row.vendor_id ?? null,
      vendorName: row.vendor_name ?? null,
    });
  }
  return [...byId.values()];
}

/**
 * Relates another vendor risk to this one. Related is the only relation two
 * vendor risks can have: neither is ever the child of the other. The same
 * vendor's risks come first, then every other vendor's.
 */
export default function RelateVendorRiskForm({
  vendorRiskId,
  existingLinks,
  onClose,
}: RelateVendorRiskFormProps) {
  const [selected, setSelected] = useState<VendorRiskOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createLink = useCreateVendorRiskLink();
  const { t } = useTranslation();

  const { data: vendorRisks = [] } = useQuery<VendorRiskOption[]>({
    queryKey: ["vendorRiskLinkCandidates"],
    queryFn: async () => {
      const response: any = await getAllVendorRisks({ filter: "active" });
      return toVendorRiskOptions(response?.data ?? []);
    },
  });

  const options = useMemo(() => {
    const linked = new Set(
      existingLinks
        .filter((link) => link.relatedRisk.entityType === "vendor_risk")
        .map((link) => link.relatedRisk.id),
    );
    const subject = vendorRisks.find((risk) => risk.id === vendorRiskId);
    const visible = vendorRisks.filter((risk) => risk.id !== vendorRiskId && !linked.has(risk.id));
    const sameVendor = (risk: VendorRiskOption) =>
      subject?.vendorId != null && risk.vendorId === subject.vendorId;
    return [...visible.filter(sameVendor), ...visible.filter((risk) => !sameVendor(risk))];
  }, [vendorRisks, existingLinks, vendorRiskId]);

  const label = (option: VendorRiskOption) =>
    option.description || fill(t("Vendor risk {id}"), { id: option.id });

  const handleSubmit = () => {
    if (!selected) return;
    setError(null);
    createLink.mutate(
      {
        sourceVendorRiskId: vendorRiskId,
        targetVendorRiskId: selected.id,
        relationType: "related_to",
      },
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
      <AutoCompleteField<VendorRiskOption>
        label="Vendor risk"
        placeholder="Search vendor risks"
        options={options}
        value={selected}
        getOptionLabel={label}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Stack
              direction="row"
              spacing={4}
              alignItems="center"
              sx={{ width: "100%", justifyContent: "space-between" }}
            >
              <span>{label(option)}</span>
              {option.vendorName && (
                <Chip size="small" variant="default" uppercase={false} label={option.vendorName} />
              )}
            </Stack>
          </li>
        )}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_event, value) => {
          setSelected(value);
          setError(null);
        }}
      />
      <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
        Related vendor risks describe the same exposure, at this vendor or another one. Neither
        inherits from the other.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={4}>
        <CustomizableButton
          size="small"
          variant="contained"
          color="primary"
          isDisabled={!selected || createLink.isPending}
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
