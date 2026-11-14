import { Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router";
import type { HomeQueueItem } from "../../../domain/types/homeQueue.types";
import { CustomizableButton } from "../../components/button/customizable-button";
import StatusBadge from "../../components/StatusBadge";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { border, navGroupColor, text } from "../../themes/palette";
import { queueItemText } from "./queueItemText";

interface QueueItemRowProps {
  item: HomeQueueItem;
}

/**
 * One item in "Needs your attention": a part dot (wayfinding only, as in the
 * sidebar), a title that links to the record, one context line, an Overdue
 * badge when due, and the action that opens the same page.
 */
const QueueItemRow = ({ item }: QueueItemRowProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { title, context, action } = queueItemText(item, t);

  return (
    <Stack
      direction="row"
      alignItems="center"
      data-testid={`home-queue-item-${item.id}`}
      sx={{
        "gap": "12px",
        "padding": "12px 16px",
        "borderTop": `1px solid ${border.light}`,
        "&:first-of-type": { borderTop: "none" },
      }}
    >
      <Box
        aria-hidden
        data-testid={`home-queue-dot-${item.id}`}
        sx={{
          width: "8px",
          height: "8px",
          flexShrink: 0,
          borderRadius: "50%",
          backgroundColor: navGroupColor[item.part].icon,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ gap: "8px", minWidth: 0 }}>
          <Typography
            component={RouterLink}
            to={item.url}
            sx={{
              "minWidth": 0,
              "fontSize": "13px",
              "fontWeight": 500,
              "color": text.primary,
              "textDecoration": "none",
              "overflow": "hidden",
              "textOverflow": "ellipsis",
              "whiteSpace": "nowrap",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {title}
          </Typography>
          {item.overdue && (
            <Box sx={{ flexShrink: 0 }}>
              <StatusBadge label={t("Overdue")} variant="error" size="small" uppercase={false} />
            </Box>
          )}
        </Stack>
        <Typography
          sx={{
            fontSize: "13px",
            color: text.secondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {context}
        </Typography>
      </Box>
      <CustomizableButton
        variant="outlined"
        text={action}
        onClick={() => navigate(item.url)}
        testId={`home-queue-action-${item.id}`}
      />
    </Stack>
  );
};

export default QueueItemRow;
