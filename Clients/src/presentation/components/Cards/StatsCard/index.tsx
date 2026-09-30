import { Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { StatsCardCaption, StatsCardFrame, StatsCardRate } from "./style";
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

  if (totalNum === 0) {
    return (
      <Stack sx={StatsCardFrame}>
        <Typography sx={StatsCardCaption}>
          No regulation connected —{" "}
          <Link
            component={RouterLink}
            to="/framework"
            sx={{
              "color": "brand.primary",
              "fontWeight": 500,
              "textDecoration": "underline",
              "textUnderlineOffset": "2px",
              "&:hover": { color: "brand.primaryHover" },
            }}
          >
            link a framework
          </Link>{" "}
          to track progress
        </Typography>
      </Stack>
    );
  }

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
        <Typography sx={StatsCardCaption}>
          {`${completedNum} ${title} out of ${totalNum} is completed`}
        </Typography>
      </Stack>
      <Typography sx={StatsCardRate}>{`${percentage}%`}</Typography>
    </Stack>
  );
}
