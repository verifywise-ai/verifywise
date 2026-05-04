import { Stack, Typography, useTheme } from "@mui/material";
import { FC } from "react";
import Select from "../Inputs/Select";
import { riskSeverityItems, likelihoodItems } from "../AddNewRiskForm/projectRiskValue";
import { RiskCalculator } from "../../tools/riskCalculator";
import { RiskLikelihood, RiskSeverity } from "./riskValues";
import { IRiskLevelProps } from "../../types/riskForm.types";
import Chip from "../Chip";

/**
 * RiskLevel component displays a form to select the likelihood and severity of a risk,
 * and calculates and displays the corresponding risk level using the RiskCalculator.
 *
 * @component
 * @param {RiskLevelProps} props - The props for the RiskLevel component.
 * @param {number} props.likelihood - The likelihood of the risk occurring.
 * @param {number} props.riskSeverity - The severity of the risk.
 * @param {function} props.handleOnSelectChange - The function to handle changes in the select inputs.
 * @returns {JSX.Element} The rendered RiskLevel component.
 */
const RiskLevel: FC<IRiskLevelProps> = ({
  likelihood,
  riskSeverity,
  handleOnSelectChange,
  disabled = false,
}) => {
  const theme = useTheme();

  // Get the selected likelihood and severity names from the items
  const selectedLikelihood = likelihoodItems.find((item) => item._id === likelihood);
  const selectedSeverity = riskSeverityItems.find((item) => item._id === riskSeverity);

  // Calculate risk level using RiskCalculator
  const riskLevel =
    selectedLikelihood && selectedSeverity
      ? RiskCalculator.getRiskLevel(
          selectedLikelihood.name as RiskLikelihood,
          selectedSeverity.name as RiskSeverity,
        )
      : { level: "", color: "" };

  return (
    <Stack sx={{ flexDirection: "row", gap: "8px" }}>
      <Select
        id="likelihood-input"
        label="Likelihood"
        placeholder="Select likelihood of risk to happen"
        value={likelihood}
        onChange={handleOnSelectChange("likelihood")}
        items={likelihoodItems}
        sx={{ width: "325px", backgroundColor: theme.palette.background.main }}
        disabled={disabled}
      />
      <Select
        id="risk-severity-input"
        label="Risk severity"
        placeholder="Select risk severity"
        value={riskSeverity}
        onChange={handleOnSelectChange("riskSeverity")}
        items={riskSeverityItems}
        sx={{ width: "325px", backgroundColor: theme.palette.background.main }}
        disabled={disabled}
      />
      <Stack gap={theme.spacing(2)}>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            color: theme.palette.text.secondary,
            margin: 0,
            height: "22px",
          }}
        >
          Risk level
        </Typography>
        <Chip label={riskLevel.level} size="medium" />
      </Stack>
    </Stack>
  );
};

export default RiskLevel;
