/**
 * This file is currently in use
 */

import { List, ListItem, ListItemButton, ListItemText, Typography, useTheme } from "@mui/material";
import { Topic } from "../../../../../application/hooks/useAssessmentAnswers";
import { background, radiusPx, palette as vwPalette } from "../../../../themes/palette";

interface AssessmentItemProps {
  assessmentsValues: Topic[];
  activeTab: number;
  handleListItemClick: (event: React.MouseEvent<HTMLDivElement, MouseEvent>, index: number) => void;
}

const AssessmentItem = ({
  assessmentsValues,
  activeTab,
  handleListItemClick,
}: AssessmentItemProps) => {
  const theme = useTheme();

  return (
    <List>
      {assessmentsValues.map((topic, index) => (
        <ListItem
          key={index}
          disablePadding
          sx={{
            "display": "block",
            "& .MuiListItemButton-root.Mui-selected": {
              backgroundColor: vwPalette.chart[0],
            },
            "& .MuiListItemButton-root.Mui-selected:hover": {
              backgroundColor: vwPalette.chart[0],
            },
          }}
        >
          <ListItemButton
            selected={index === activeTab}
            onClick={(event) => handleListItemClick(event, index)}
            disableRipple
            sx={{
              paddingLeft: 4,
              borderRadius: radiusPx.sm,
              backgroundColor: index === activeTab ? vwPalette.chart[0] : "transparent",
              width: 260,
              height: 40,
            }}
          >
            <ListItemText
              primary={
                <Typography
                  color={index === activeTab ? `${background.main}` : theme.palette.text.primary}
                  sx={{ fontSize: 13 }}
                >
                  {topic.title}
                </Typography>
              }
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
};

export default AssessmentItem;
