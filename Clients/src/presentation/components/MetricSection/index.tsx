import { FC, memo } from "react";
import { Typography, Stack } from "@mui/material";
import { StyledStack, styles } from "./styles";
import { MetricSectionProps } from "../../types/interfaces/i.metricSection";

/**
 * MetricSection component displays a section with metrics based on the provided metric type.
 *
 * @component
 * @param {Object} props - The props for the MetricSection component.
 * @param {string} props.title - The title of the metric section.
 * @param {string} [props.metricType] - Optional type of metrics to display.
 * @param {Assessments} props.assessments - The assessments data for metrics calculation.
 * @param {Controls} props.controls - The controls data for metrics calculation.
 * @returns {JSX.Element} The rendered MetricSection component.
 */
const MetricSection: FC<MetricSectionProps> = ({
  title,
  assessments,
  controls,
}) => {
  const complianceMetrics: {
    title: string;
    value: string | number;
  }[] = [
    {
      title: "Compliance tracker completion rate",
      value: `${controls.percentageComplete.toFixed(2)}%`,
    },
    {
      title: "Assessment tracker completion rate",
      value: `${assessments.percentageComplete.toFixed(2)}%`,
    },
  ];
  const metrics = complianceMetrics;

  return (
    <>
      <Typography
        variant="h2"
        component="div"
        sx={{
          pb: 8.5,
          color: "text.primary",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {title}
      </Typography>
      <Stack
        direction="row"
        justifyContent="space-between"
        spacing={15}
        sx={{ mb: 17 }}
      >
        {metrics.map((metric, index) => (
          <StyledStack key={index}>
            <Typography sx={styles.gridTitle}>{metric.title}</Typography>
            <Typography sx={styles.gridValue}>{metric.value}</Typography>
          </StyledStack>
        ))}
      </Stack>
    </>
  );
};

export default memo(MetricSection);
