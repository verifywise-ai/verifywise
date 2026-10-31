import { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import SelectComponent from "../../../components/Inputs/Select";
import CustomizableMultiSelect from "../../../components/Inputs/Select/Multi";
import { CustomizableButton } from "../../../components/button/customizable-button";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import {
  useUpdateUseCaseOrgSettings,
  useUseCaseOrgSettings,
} from "../../../../application/hooks/useUseCaseOrgSettings";
import { EUROPE_GEOGRAPHY_ID, GEOGRAPHY_ITEMS } from "../../../../application/constants/geography";

const EU_AI_ACT_FRAMEWORK_ID = 1;

interface UseCaseDefaultsSectionProps {
  isDisabled?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

/**
 * Region and frameworks a new use case starts with. People can still change
 * them on each use case; approved intake requests get the frameworks when
 * the EU AI Act questionnaire produced no classification.
 */
const UseCaseDefaultsSection = ({
  isDisabled,
  onError,
  onSuccess,
}: UseCaseDefaultsSectionProps) => {
  const { data: settings } = useUseCaseOrgSettings();
  const { mutateAsync: save, isPending: saving } = useUpdateUseCaseOrgSettings();
  const { allFrameworks } = useFrameworks({ listOfFrameworks: [] });

  const [region, setRegion] = useState<number | "">("");
  const [frameworkIds, setFrameworkIds] = useState<number[]>([]);

  useEffect(() => {
    if (!settings) return;
    setRegion(settings.default_geography ?? "");
    setFrameworkIds(settings.default_framework_ids);
  }, [settings]);

  // Only frameworks that apply to a single use case can be defaults.
  const frameworkItems = useMemo(
    () =>
      (allFrameworks ?? [])
        .filter((fw) => fw.is_organizational === false)
        .map((fw) => ({ _id: Number(fw.id), name: fw.name })),
    [allFrameworks],
  );

  const onRegion = (event: { target: { value: unknown } }) => {
    const next = event.target.value === "" ? "" : Number(event.target.value);
    setRegion(next);
    // Europe suggests the EU AI Act when nothing is picked yet; it can be removed.
    if (
      next === EUROPE_GEOGRAPHY_ID &&
      frameworkIds.length === 0 &&
      frameworkItems.some((fw) => fw._id === EU_AI_ACT_FRAMEWORK_ID)
    ) {
      setFrameworkIds([EU_AI_ACT_FRAMEWORK_ID]);
    }
  };

  const onFrameworks = (event: { target: { value: unknown } }) => {
    const value = event.target.value;
    setFrameworkIds((Array.isArray(value) ? value : [value]).map(Number));
  };

  const handleSave = async () => {
    try {
      await save({
        default_geography: region === "" ? null : region,
        default_framework_ids: frameworkIds,
      });
      onSuccess("Use case defaults saved");
    } catch (error: any) {
      onError(error?.message || "Failed to save use case defaults");
    }
  };

  return (
    <Box sx={{ mt: "48px" }} data-testid="use-case-defaults-section">
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: "8px" }}>
        Defaults for new use cases
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: "24px", maxWidth: 560 }}>
        New use cases start with this region and these frameworks. People can change them on each
        use case.
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "360px",
          mb: "24px",
        }}
      >
        <SelectComponent
          id="use-case-default-region"
          label="Region"
          items={[...GEOGRAPHY_ITEMS]}
          value={region}
          onChange={onRegion}
          placeholder="No default"
          disabled={isDisabled}
          sx={{ width: "100%" }}
        />
        <CustomizableMultiSelect
          label="Frameworks"
          value={frameworkIds}
          onChange={onFrameworks}
          items={frameworkItems}
          placeholder="No default frameworks"
          disabled={isDisabled}
        />
      </Box>

      <CustomizableButton
        variant="contained"
        text="Save use case defaults"
        onClick={handleSave}
        isDisabled={isDisabled || saving || !settings}
        testId="use-case-defaults-save-btn"
      />
    </Box>
  );
};

export default UseCaseDefaultsSection;
