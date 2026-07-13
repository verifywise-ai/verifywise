import { useMemo, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import { SearchBox } from "../../../components/Search";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { MrmTier } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow } from "../../../../domain/interfaces/i.mrm";
import { useAssignModelTier, useFleetTiering } from "../../../../application/hooks/useMrm";
import {
  fleetModelName,
  mrmErrorMessage,
  TIER_OPTIONS,
  tierChipVariant,
  tierLabel,
} from "./constants";
import {
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
  mrmToolbarStyle,
} from "./mrmStyles";

interface TieringTabProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const TIER_LEGEND =
  "Tier 1 full independent validation + continuous monitoring · annual revalidation.  Tier 2 standard validation + periodic monitoring · 18-month cycle.  Tier 3 lightweight review · biennial.  Tiering rules and cadence are configured in Settings → Tiering rules.";

const TieringTab = ({ onError, onSuccess }: TieringTabProps) => {
  const { data: fleet = [], isLoading } = useFleetTiering();
  const assignTier = useAssignModelTier();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedModel, setSelectedModel] = useState<IMrmFleetRow | null>(null);
  const [tier, setTier] = useState<MrmTier | "">("");
  const [drivers, setDrivers] = useState("");

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return fleet;
    return fleet.filter((row) => fleetModelName(row).toLowerCase().includes(term));
  }, [fleet, searchTerm]);

  const openAssign = (row: IMrmFleetRow) => {
    setSelectedModel(row);
    setTier(row.mrm_tier ?? "");
    setDrivers(row.mrm_materiality_drivers ?? "");
  };

  const closeAssign = () => {
    setSelectedModel(null);
    setTier("");
    setDrivers("");
  };

  const handleAssign = async () => {
    if (!selectedModel || !tier) {
      onError("Select a tier before saving.");
      return;
    }
    try {
      await assignTier.mutateAsync({
        modelId: selectedModel.id,
        payload: { tier, materiality_drivers: drivers.trim() || null },
      });
      onSuccess("Tier assigned");
      closeAssign();
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to assign tier"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Model risk tiering (your model&apos;s risk rating / materiality classification). Sort every
        model into a risk tier so the critical ones get enhanced scrutiny and the low-risk ones get
        proportionate, lighter oversight. The tier sets validation depth, revalidation frequency and
        monitoring cadence — so it is the keystone every other step depends on. Tier assignment is
        manual.
      </Typography>

      <Box sx={mrmToolbarStyle}>
        <SearchBox
          placeholder="Search models..."
          value={searchTerm}
          onChange={setSearchTerm}
          inputProps={{ "aria-label": "Search models" }}
          fullWidth={false}
        />
      </Box>

      {isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No models to tier yet. Add models to your inventory first." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Model</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Type</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Tier</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Materiality drivers</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Tiered on</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Status</TableCell>
                <TableCell sx={mrmTableHeadCellStyle} align="right">
                  Action
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={mrmTableCellStyle}>{fleetModelName(row)}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>{row.provider ?? "—"}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    <Chip
                      label={tierLabel(row.mrm_tier)}
                      variant={tierChipVariant(row.mrm_tier)}
                      uppercase={false}
                    />
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>{row.mrm_materiality_drivers ?? "—"}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    {row.mrm_tiered_at ? displayFormattedDate(row.mrm_tiered_at) : "—"}
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    {row.status ? <Chip label={row.status} uppercase={false} /> : "—"}
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle} align="right">
                    <CustomizableButton
                      variant="outlined"
                      size="small"
                      text="Assign tier"
                      onClick={() => openAssign(row)}
                      testId="mrm-assign-tier-btn"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography
        sx={{ fontSize: "12px", color: "text.tertiary", marginTop: "12px", lineHeight: 1.6 }}
      >
        {TIER_LEGEND}
      </Typography>

      <StandardModal
        isOpen={!!selectedModel}
        onClose={closeAssign}
        title="Assign tier"
        description={
          selectedModel
            ? `Set the risk tier and materiality drivers for ${fleetModelName(selectedModel)}.`
            : ""
        }
        onSubmit={handleAssign}
        submitButtonText="Save"
        isSubmitting={assignTier.isPending}
        fitContent
      >
        <Stack sx={{ gap: "48px" }}>
          <Select
            id="mrm-assign-tier"
            label="Tier"
            placeholder="Select a tier"
            isRequired
            value={tier}
            items={TIER_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) => setTier(e.target.value as MrmTier)}
          />
          <Field
            id="mrm-materiality-drivers"
            label="Materiality drivers"
            placeholder="Why this tier? e.g. capital impact, regulatory reporting, customer exposure"
            value={drivers}
            onChange={(e) => setDrivers(e.target.value)}
            multiline
            minRows={3}
            isOptional
          />
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default TieringTab;
