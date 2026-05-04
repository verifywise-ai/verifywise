import { Stack, Typography } from "@mui/material";
import { StatsCardFrame, StatsCardRate } from "./style";
import ProgressBar from "../../ProjectCard/ProgressBar";
import { useMemo } from "react";
import { StatsCardProps } from "../../../types/interfaces/i.statsCard";

export function StatsCard({ title, completed, total }: StatsCardProps) {
  // Convert to numbers and ensure they are non-negative
  const completedNum = useMemo(() => {
    const num = Number(completed);
    return isNaN(num) || num < 0 ? 0 : num;
  }, [completed]);

  const totalNum = useMemo(() => {
    const num = Number(total);
    return isNaN(num) || num < 0 ? 0 : num;
  }, [total]);

  const progress = useMemo(() => `${completedNum}/${totalNum}`, [completedNum, totalNum]);
  const percentage = useMemo(() => {
    if (totalNum === 0) return 0;
    const result = Math.floor((completedNum / totalNum) * 100);
    return isNaN(result) ? 0 : result;
  }, [completedNum, totalNum]);

  return (
    <Stack sx={StatsCardFrame}>
      <Stack
        sx={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          gap: 3,
          mt: "10px",
        }}
      >
        <ProgressBar progress={progress} />
        <Typography
          sx={{
            color: "#8594AC",
            fontSize: 13,
          }}
        >
          {`${completedNum} ${title} out of ${totalNum} is completed`}
        </Typography>
      </Stack>
      <Typography sx={StatsCardRate}>{`${percentage}%`}</Typography>
    </Stack>
  );
}
