import { Link, Skeleton, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { StatsCardCaption, StatsCardFrame, StatsCardRate } from "./style";
import ProgressBar from "../../ProjectCard/ProgressBar";
import { useMemo } from "react";
import { StatsCardProps } from "../../../types/interfaces/i.statsCard";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";

/** A count as a non-negative number (anything else counts as 0). */
const toCount = (value: number | null | undefined) => {
  const num = Number(value);
  return isNaN(num) || num < 0 ? 0 : num;
};

export function StatsCard({ title, completed, total }: StatsCardProps) {
  const { t } = useTranslation();
  const completedNum = useMemo(() => toCount(completed), [completed]);
  const totalNum = useMemo(() => toCount(total), [total]);
  const percentage = totalNum === 0 ? 0 : Math.floor((completedNum / totalNum) * 100);

  // The caller has not loaded its progress yet: a 0 here would be a guess.
  if (total === null || total === undefined) {
    return (
      <Stack sx={StatsCardFrame} aria-busy="true">
        <Stack sx={{ width: "100%", gap: "8px", mt: "10px" }}>
          <Skeleton variant="rounded" height={8} />
          <Skeleton variant="text" width="40%" />
        </Stack>
      </Stack>
    );
  }

  if (totalNum === 0) {
    return (
      <Stack sx={StatsCardFrame}>
        <Typography sx={StatsCardCaption}>
          {t("No regulation connected")} —{" "}
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
            {t("link a framework to track progress")}
          </Link>
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
        <ProgressBar progress={`${completedNum}/${totalNum}`} />
        <Typography sx={StatsCardCaption}>
          {fill(t("{items}: {done} of {total} completed"), {
            items: t(title),
            done: completedNum,
            total: totalNum,
          })}
        </Typography>
      </Stack>
      <Typography sx={StatsCardRate}>{`${percentage}%`}</Typography>
    </Stack>
  );
}
